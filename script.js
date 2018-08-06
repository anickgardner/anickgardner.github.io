var GitHubWidget;
(function() {

GitHubWidget = function (options) {
	var template = "github-widget";

	this.defaultConfig = {
		sortBy: 'updateTime', // possible: 'stars', 'updateTime'
		reposHeaderText: 'Last updated',
		maxRepos: 10
	}

	options = options || this.defaultConfig;

	this.$template = document.getElementById(template);
	this.user = options.userName || this.$template.dataset.username;

	this.url = {
		api: "https://api.github.com/users/" + this.user,
		langs: []
	};
	
	this.error = null;
	this.data = null;

	this.profile = {};
	this.langs = {};

	// load resources and render widget
	this.init();
};

GitHubWidget.prototype.init = function() {
	this.load();
	this.loadCSS();
	this.render();
};

// first call to API
// get all profile data

GitHubWidget.prototype.load = function () {
	var request = this.getURL(this.url.api);
	this.data = JSON.parse(request.responseText);
	
	if (request.status === 200 ) {

		this.error = null;

		this.loadRepos();

	} else {
		var limitRequests = request.getResponseHeader('X-RateLimit-Remaining');
		
		this.error = {
			message: this.data.message
		};

		if (Number(limitRequests) === 0) {
			// API is blocked
			var resetTime = request.getResponseHeader('X-RateLimit-Reset');
			this.error.resetDate = new Date(resetTime * 1000);

			// full message is too long, leave only important thing
			this.error.message = this.error.message.split('(')[0]; 
		}

		if (request.status === 404) {
			this.error.isWrongUser = true;
		}
	}
};

GitHubWidget.prototype.loadRepos = function () {
	var request = this.getURL(this.data.repos_url);

	this.profile.repos = JSON.parse(request.responseText);  

	// get API urls to generate language stats
	for (var k in this.profile.repos) {
		this.url.langs.push(this.profile.repos[k].languages_url);
	}

	return this.profile.repos;
};

GitHubWidget.prototype.getRepos = function() {
	return this.profile.repos;
}

GitHubWidget.prototype.getTopLanguages = function (callback) {
	var langStats = []; // array of URL strings

	// get URLs with language stats for each repository
	this.url.langs.forEach(function (apiURL) {
		var that = this,
			request = new XMLHttpRequest();

		request.addEventListener('load', function () {

			var repoLangs = JSON.parse(request.responseText);
			langStats.push(repoLangs);

			if (langStats.length === that.url.langs.length) { // all requests were made
				calcPopularity.bind(that)();
			}

		}, false);

		request.open("GET", apiURL, true);
		request.send(null);
	}, this);

	// give rank (weights) to the language
	var calcPopularity = function () {
		langStats.forEach(function(repoLangs) {
			var k, sum = 0;

			for (k in repoLangs) {
				if (repoLangs[k] !== undefined) {
					sum += repoLangs[k];
					this.langs[k] = this.langs[k] || 0;    
				}
			}

			for (k in repoLangs) {
				if (repoLangs[k] !== undefined) {
					this.langs[k] += repoLangs[k] / (sum * 1.00); // force floats
				}
			}
		}, this);

		callback();
	};
};

GitHubWidget.prototype.render = function (options) {
	options = options || this.defaultConfig;
	console.log(options);

	var $root = this.$template;

	// clear root template element to prepare space for widget
	while($root.hasChildNodes()) {
		$root.removeChild($root.firstChild);
	}

	// handle API errors
	if (this.error) {
		var $error = document.createElement("div");
		$error.className = "error";

		$error.innerHTML = '<span>' + this.error.message + '</span>';

		if (this.error.isWrongUser) {
			$error.innerHTML = '<span>Not found user: ' + this.user + '</span>';
		}

		if (this.error.resetDate) {
			var remainingTime = this.error.resetDate.getMinutes() - new Date().getMinutes();
			remainingTime = (remainingTime < 0) ? 60 + remainingTime : remainingTime;

			$error.innerHTML += '<span class="remain">Come back after ' + remainingTime + ' minutes</span>';
		}

		$root.appendChild($error);

		return false;
	}

	// API doesen't return errors, try to built widget
	var $profile = this.render.profile.bind(this)();

	this.getTopLanguages((function () {
		var $langs = this.render.langs.bind(this)();
		$profile.appendChild($langs);
	}).bind(this));		

	$root.appendChild($profile);

	if (options.maxRepos > 0) {
		var $repos = this.render.repos.bind(this)(options.sortBy, options.maxRepos),
			$reposHeader = document.createElement('span');
		$reposHeader.className = "header";
		$reposHeader.appendChild(document.createTextNode(options.reposHeaderText + ' repositories'));

		$repos.insertBefore($reposHeader, $repos.firstChild);
		$root.appendChild($repos);
	}
};

GitHubWidget.prototype.render.repos = function (sortyBy, maxRepos) {
	var reposData = this.getRepos();

	var $reposList = document.createElement('div');

	reposData.sort (function (a, b) {
		// sorted by last commit
		if (sortyBy == "stars") {
			return b.stargazers_count - a.stargazers_count;
		} else {
			return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
		}
	});

	for (var i = 0; i < maxRepos && reposData[i]; i++) {
		var updated = new Date(reposData[i].updated_at);
		var $repoLink = document.createElement('a');

		$repoLink.href = reposData[i].html_url;
		$repoLink.title = reposData[i].description;
		$repoLink.innerHTML += '<span class="repo-name">' + reposData[i].name + '</span>';
		$repoLink.innerHTML += '<span class="updated">Updated: ' + updated.toLocaleDateString() + '</span>';
		$repoLink.innerHTML += '<span class="star">' + reposData[i].stargazers_count + '</span>';

		$reposList.appendChild($repoLink);
	}

	$reposList.className = 'repos';
	return $reposList;
};

GitHubWidget.prototype.render.profile = function () {
	var $profile = document.createElement('div'),
		$name   = document.createElement('a'),
		$avatar = document.createElement('img'),
		$stats  = document.createElement('div'),
		$followContainer = document.createElement('div'),
		$followButton = document.createElement('a'),
		$followers = document.createElement('span');

	$name.href = this.data.html_url;
	$name.className = "name";
	$name.appendChild(document.createTextNode(this.data.name));
	
	$avatar.src = this.data.avatar_url;
	$avatar.className = "avatar";

	$followButton.href = $name.href;
	$followButton.className = "follow-button";
	$followButton.innerHTML = "Follow @" + this.user;

	$followers.href = this.data.followers_url;
	$followers.className = "followers";
	$followers.innerHTML = this.data.followers;

	$followContainer.className = "followMe";
	$followContainer.appendChild($followButton);
	$followContainer.appendChild($followers);

	$profile.appendChild($avatar);
	$profile.appendChild($name);
	$profile.appendChild($followContainer);
	$profile.appendChild($stats);
	$profile.classList.add("profile");

	return $profile;
};

GitHubWidget.prototype.render.langs = function () {

	var $langsList = document.createElement('ul');

	var topLangs = [];
	for (var k in this.langs) {
		topLangs.push([k, this.langs[k]]);
	}

	topLangs.sort(function (a, b) {
		return b[1] - a[1];
	});

	// generating HTML structure
	for (var i = 0; i < 3 && topLangs[i]; i++) {
		$langsList.innerHTML += "<li>" + topLangs[i][0] + "</li>";
	}

	$langsList.className = "languages";
	return $langsList;
};

// handle AJAX requests to GitHub's API
GitHubWidget.prototype.getURL = function (url, async) {
	async = async || false;

	var request = new XMLHttpRequest();
		request.open("GET", url, async);
		request.send();
	
	return request;
};

GitHubWidget.prototype.loadCSS = function() {
	var $style = document.createElement("link"),
		$scripts = document.getElementsByTagName("script"),
		scriptPath;
	
	scriptPath = $scripts[$scripts.length-1].src;	// This works because the browser loads and executes scripts in order, 
													// so while your script is executing, 
													// the document it was included in 
													// is sure to have your script element as the last one on the page
	$style.rel = "stylesheet";
	$style.href = scriptPath + "/../gh-profile-widget.css";

	document.head.appendChild($style);
	this.$template.className = "gh-profile-widget";

	return $style.sheet;	
};

})();

var widget = new GitHubWidget();


// Generating new widget from user input
document.addEventListener('DOMContentLoaded', function() {

	var options = widget.defaultConfig;

	// Sort repository acording to
	// radio inputs on website

	var $sortingRadios = document.querySelectorAll('.choose-repo-sorting label');

	// sort by update time
	$sortingRadios[0].addEventListener('click', function (element) {
		element.target.classList.add('active');
		$sortingRadios[1].classList.remove('active');

		options.sortBy = 'updateTime';
		options.reposHeaderText = element.target.textContent;

		widget.render(options);

	});

	// sort by starrgazers
	$sortingRadios[1].addEventListener('click', function (element) {
		element.target.classList.add('active');
		$sortingRadios[0].classList.remove('active');

		options.sortBy = 'stars';
		options.reposHeaderText = element.target.textContent;

		widget.render(options);
	});

	// Manipulating the number of repositories

	var $inputNumber = document.getElementById('gh-reposNum');

	$inputNumber.onchange = function() { 
		options.maxRepos = $inputNumber.value;
		
		widget.render(options);
	}

	// Creating brand new widget instance
	// for user that we type in input

	var	$input = document.getElementById('gh-uname'),
		$submit = document.getElementById('gh-uname-submit');

	$submit.addEventListener('click', function (element) {
		widget = new GitHubWidget({ userName: $input.value });

		element.preventDefault();
	});
 });
 style.css
/**
 * Github widget styles 
 * ------------------------------------------------------------------
 */

.gh-profile-widget {

	& {
		width: 280px;
		border-radius: 5px;
		font-size: 16px;
		font-family: Helvetica;
		background: #FAFAFA;
		border-width: 1px 1px 2px;
		border-style: solid;
		border-color: #DDD;
		overflow: hidden;    
	}

	a {
		text-decoration: none;
		color: #444;

		&:hover {
			color: #4183C4;
		}
	}

	.name {
		display: block;
		font-size: 1.2em;
		font-weight: bold;
		color: #222;
	}

	.error {
		& {
			font-size: 0.8em;
			color: #444;
			padding: 10px;
		}

		span {
			display: block;
			border-bottom: 1px solid #DDD;
			padding-bottom: 5px;
			margin-bottom: 5px;

			&.remain {
				text-align: center;
				font-weight: bold;
			}
		}
	}

	.profile {
		background: #FFF;
		overflow: hidden;
		padding: 15px 10px;
		padding-bottom: 0;
		min-height: 135px;
	}

	.stats {
		padding: 5px;
	}

	.languages {
		& {
			position: relative;
			clear: both;
			margin: 0 -10px;
			padding: 10px;
			
			border-top: 1px solid #DEDEDE;
			font-size: 0.8em;
		}

		&::before {
			position: absolute;
			top: -0.7em;
			background: #FFF;
			padding-right: 5px;
			content: 'Top languages';
			font-style: italic;
			color: #555;
		}

		li {
			display: inline-block;
			color: #444;
			font-weight: bold;
			margin-left: 10px;

			&::after {
				content: '\2022';
				margin-left: 10px;
				color: #999;       
			}

			&:last-child::after {
				content: '';
			}
		}
	}

	.followMe {
		margin-top: 3px;
	}

	.follow-button {
		font-size: 0.8em;
		color: #333;
		float: left;
		padding: 0 10px;
		line-height: 1.5em;
		border: 1px solid #D5D5D5;
		border-radius: 3px;
		font-weight: bold;
		background: #EAEAEA;
		background-image: linear-gradient(#FAFAFA, #EAEAEA);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.9);
		-moz-user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
		user-select: none;
	}

	.follow-button:hover {
		color: inherit;
		background: #DDD;
		background-image: linear-gradient(#EEE, #DDD); 
	}

	/* followers number */
	.followMe span {
		position: relative;
		background: #FFF;
		margin-left: 8px;
		padding: 0 5px;
		color: #444;
		font-size: 0.8em;
		border: 1px solid;
		border-color: #BBB;
	}

	.followMe span::before {
		content: '';
		position: absolute;
		display: block;
		width: 5px;
		height: 5px;
		left: -4px;
		top: 30%;
		background: inherit;
		border-left: 1px solid;
		border-top: 1px solid;
		border-color: inherit;
		-moz-transform: rotate(-45deg);
		-webkit-transform: rotate(-45deg);
		-ms-transform: rotate(-45deg);
		transform: rotate(-45deg);
	}

	.avatar {
		width: 64px;
		height: 64px;
		float: left;
		margin: 0 10px 15px 0;
		margin-left: 0;
		border-radius: 5px;
		box-shadow: 0 0 2px 0 #DDD;
	}

	/* List of repositories */

	.repos {

		& {
			clear: both;
		}

		.header {
			display: block;
			width: 100%;
			font-weight: bold;
			background: #EAEAEA;
			background-image: linear-gradient(#FAFAFA, #EAEAEA);
			border: solid #D5D5D5;
			border-width: 1px 0;
			color: #555;
			font-size: 0.8em;
			padding: 5px 10px;
		}

		a {
			position: relative;
			display: block;
			padding: 7px 10px;
			font-size: 0.9em;
			border-top: 1px solid #DDD;

			&:first-of-type {
				border: none;
			}
		}

		.repo-name {
			max-width: 280px;
			font-weight: bold;
			text-overflow: ellipsis;
		}

		.updated {
			display: block;
			font-size: 0.75em;
			font-style: italic;
			color: #777;
		}

		.star {
			position: absolute;
			font-size: 0.9em;
			right: 0.5em;
			top: 1.1em;
			color: #888;

			&::after {
				content: '\a0\2605';
				font-size: 1.1em;
				font-weight: bold;
			}
		}
	}
}

/* Demo styles */

* {
  box-sizing: border-box;
}

body {
  background-color: #F4EADE;
  max-width: 650px;
  margin: 10px auto;
}

.config-section-left,
.config-section-right {
  float: left;
  max-width: 200px;
}

.content-section {
  float: left;
}

.tooltip {
  position: relative;
  display: block;
  box-shadow: 0 0 3px 1px #BBB;
  background: #FFF;
  border: 1px solid #999;
  padding: 2px 7px;
  margin-top: 15px;
  margin-right: 15px;
}

.tooltip::before {
  content: '';
  position: absolute;
  display: block;
  width: 10px;
  height: 10px;
  right: -6px;
  top: 6px;
  background: inherit;
  border-right: 1px solid;
  border-bottom: 1px solid;
  border-color: inherit;
  transform: rotate(-45deg);
  -webkit-transform: rotate(-45deg);
  -ms-transform: rotate(-45deg);
}

.config-section-right {
  position: relative;
  top: 125px;
}

.config-section-right .tooltip {
  margin-left: 15px;
}

.config-section-right .tooltip::before {
  left: -6px;
  right: auto;

  border: none;
  border-top: 1px solid;
  border-left: 1px solid;
  border-color: inherit;
}

input[type="text"],
input[type="number"] {
  border: none;
  max-width: 100px;
  padding-right: 5px;
}

input[type="number"] {
  max-width: 50px;
}

input[type="submit"] {
  background: #D14836;
  color: #FFF;
  border: none;
  border-radius: 3px;
  padding: 3px 5px;
  font-size: 0.7em;
}

label {
  font-size: 0.7em;
}
.choose-repo-sorting {
  position: relative;
  top: 80px;
}

.choose-repo-sorting [type="radio"] {
  display: none;
}

.active {
  font-weight: bold;
}

/* Demo styles */

* {
  box-sizing: border-box;
}

body {
  background-color: #F4EADE;
  max-width: 650px;
  margin: 10px auto;
}

.config-section-left,
.config-section-right {
  float: left;
  max-width: 200px;
}

.content-section {
  float: left;
}

.tooltip {
  position: relative;
  display: block;
  box-shadow: 0 0 3px 1px #BBB;
  background: #FFF;
  border: 1px solid #999;
  padding: 2px 7px;
  margin-top: 15px;
  margin-right: 15px;
}

.tooltip::before {
  content: '';
  position: absolute;
  display: block;
  width: 10px;
  height: 10px;
  right: -6px;
  top: 6px;
  background: inherit;
  border-right: 1px solid;
  border-bottom: 1px solid;
  border-color: inherit;
  transform: rotate(-45deg);
  -webkit-transform: rotate(-45deg);
  -ms-transform: rotate(-45deg);
}

.config-section-right {
  position: relative;
  top: 125px;
}

.config-section-right .tooltip {
  margin-left: 15px;
}

.config-section-right .tooltip::before {
  left: -6px;
  right: auto;

  border: none;
  border-top: 1px solid;
  border-left: 1px solid;
  border-color: inherit;
}


label {
  font-size: 0.7em;
}
.choose-repo-sorting {
  position: relative;
  top: 80px;
}

.choose-repo-sorting [type="radio"] {
  display: none;
}

.active {
  font-weight: bold;
}
