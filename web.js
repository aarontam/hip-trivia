var ack = require('ac-koa').require('hipchat');
var pkg = require('./package.json');
var app = ack(pkg);
var req = require('co-request');

var cats = {};
var scores = {};
var names = {};
var state = {};

var vowelThreshold = 0.4;

var addon = app.addon()
	.hipchat()
	.allowRoom(true)
	.scopes('send_notification');

if (process.env.DEV_KEY) {
	addon.key(process.env.DEV_KEY);
}

function* reset() {
	var clueFn = generateClue.bind(this);
	state.answer = state.parsedAnswer = state.value = null;
	yield* clueFn();
}

function* api(endpoint, params) {
	var res = yield req.get({
		url: 'http://jservice.io/api/' + endpoint + (params ? '?' + params : '')
	});

	if (res.statusCode === 200 && res.body) return JSON.parse(res.body);
}

function* generateClue() {
	var endpoint, params, payload, clue, category, question;

	if (state.categoryId) {
		endpoint = 'clues';
		params = 'category=' + state.categoryId + '&offset=' + Math.floor(Math.random()*state.cluesCount);
	} else {
		endpoint = 'random';
		params = 'count=1';
	}

	payload = yield* api(endpoint, params);
	clue = payload[0];

	if (clue && clue.answer) { // clue request
		if (state.answer) this.roomClient.sendNotification('Previous answer: ' + state.answer);

		category = clue.category && clue.category.title;
		question = clue.question;
		state.answer = clue.answer;
		state.value = clue.value;
		state.parsedAnswer = scrubAnswer(state.answer);

		this.roomClient.sendNotification((category ? '[<b>' + category.toUpperCase() + '</b> for <em>$' + clue.value + '</em>]<br />' : '') + question);
	}
}

function scrubAnswer(answer) {
	return answer.replace(/((^|\s+)(a|an|and|the|&)(\s+))|(\(.*\))|(<\/?i>)|(\u003C\/?i\u003E)/gi, '').replace(/[\s.,-\/#!$%\^&\*;:{}=\-_`~"\'\\()?!]/g, '').toUpperCase();
}

function* checkAnswer(guess) {
	var scrubbedGuess, vowels, correct,
		matchesGuess, matchesAnswer,
		arrGuess, arrAnswer,
		idx, resetFn;

	if (state.answer) {
		scrubbedGuess = scrubAnswer(guess);
		vowels = scrubbedGuess.match(/[aeiuo]/gi);
		correct = false;

		if (vowels && vowels.count / scrubbedGuess.length < vowelThreshold) { // compare only consonants
			matchesGuess = scrubbedGuess.match(/[^aeiuo]/gi);
			matchesAnswer = state.parsedAnswer.match(/[^aeiuo]/gi);

			if (matchesGuess && matchesAnswer) {
				matchesGuess = matchesGuess.join('');
				matchesAnswer = matchesAnswer.join('');
				correct = matchesGuess == matchesAnswer;
			}
		} else { // sort by characters and compare
			if (scrubbedGuess.length == state.parsedAnswer.length) {
				arrGuess = scrubbedGuess.split('');
				arrAnswer = state.parsedAnswer.split('');
				correct = true;
				for (idx = 0; idx < arrGuess.length; idx++) {
					if (arrGuess[idx] != arrAnswer[idx]) {
						correct = false;
						break;
					}
				}
			}
		}

		if (correct) {
			scores[this.sender.id] = (scores[this.sender.id] ? scores[this.sender.id] : 0) + state.value;
			names[this.sender.id] = this.sender.name;
			yield this.roomClient.sendNotification(this.sender.name + ' is correct! Current winnings: $' + scores[this.sender.id] + '<br />'
											+ 'Answer: <b>' + state.answer + '</b>');
			resetFn = reset.bind(this);
			yield* resetFn();
		} else {
			yield this.roomClient.sendNotification('Womp womp, ' + this.sender.name);
		}
	} else {
		yield this.roomClient.sendNotification('Whoops! Too late, ' + this.sender.name);
	}
}

addon.webhook('room_message', /^\/(trivia|t|a|ans|answer)(?:$|\s)(?:(.+))?/, function *() {
	var mode = this.match[1],
		args = this.match[2],
		endpoint = '',
		params = '',
		checkFn, clueFn, resetFn,
		command, option,
		winnings, msg,
		id, idx,
		payload, catInfo;

	switch (mode) {
		case 'a':
		case 'ans':
		case 'answer':
			checkFn = checkAnswer.bind(this);
			yield* checkFn(args);
			break;

		case 't':
		case 'trivia':
			args = args ? args.trim() : null;

			if (args) {
				args = args.split(' ');
				command = args[0];
				option = args[1];

				switch (command) {
					case 'a':
					case 'answer':
						checkFn = checkAnswer.bind(this);
						checkFn(option);
						break;
					case 'c':
					case 'cat':
					case 'cats':
					case 'category':
					case 'categories':
						if (option) {
							catInfo = cats[option];
							if (catInfo) {
								state.category = option;
								state.categoryId = catInfo.id;
								state.cluesCount = catInfo.count;
								yield this.roomClient.sendNotification('The category has been set to <b>' + option + '</b>');
							} else {
								yield this.roomClient.sendNotification('The <em>' + option + '</em> category could not be found; try specifying another.');
							}
						} else {
							endpoint = 'categories';
							params = 'count=10&offset=' + Math.floor(Math.random()*1000);
							msg = '<b>Categories</b><br />';

							for (idx = 0; idx < payload.length; idx++) {
								cats[payload[idx].title] = {id: payload[idx].id, count: payload[idx].clues_count};
								msg += (idx+1) + '. ' + payload[idx].title + '<br />';
							}

							yield this.roomClient.sendNotification(msg);
						}
						break;
					case 'info':
						yield this.roomClient.sendNotification('The current category is <b>' + state.category + '</b>');
						break;
					case 'uncle':
					case 'giveup':
						yield this.roomClient.sendNotification('Answer: ' + state.answer);
						resetFn = reset.bind(this);
						yield* resetFn();
						break;
					case 'help':
					case '?':
						yield this.roomClient.sendNotification('To ask a new question: <b>/trivia</b>' + '<br />'
															+  'To answer a question: <b>/answer [your answer]</b>' + '<br />'
															+  'To list 10 (random) categories: <b>/trivia categories</b>' + '<br />'
															+  'To set the current category (using a previously listed category): <b>/trivia category [category title]</b>' + '<br />'
															+  'To reveal the current answer (don\'t spoil it for others!): <b>/trivia uncle</b>' + '<br />'
															+  'To see the leaderboard: <b>/trivia standings</b>' + '<br />'
															+  'A new trivia question will appear shortly after the previous question is answered correctly, or when the room gives up.');
						break;
					case 'standings':
					case 'score':
					case 'scores':
					case 'scoreboard':
					case 'winnings':
					case 'leaders':
					case 'leaderboard':
					case 'results':
						msg = '<b>Leaderboard</b><br />';
						winnings = Object.keys(scores).sort(function (a,b) { return scores[b] - scores[a]; });
						for (idx = 0; idx < winnings.length; idx++) {
							id = winnings[idx];
							msg += names[id] + ': $' + scores[id] + '<br />';
						}
						yield this.roomClient.sendNotification(msg);
						break;
				}
			} else {
				if (!state.answer) {
					clueFn = generateClue.bind(this);
					yield* clueFn();
				}
			}

			break;
	}
});

app.listen();
