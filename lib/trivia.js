var req = require('co-request'),
	latinizer = require('./latinizer'),
	fails = require('./fails.json'),
	mode = require('./modes');

var reScrub = /((^|\s*)(a|an|and|the|&|or)(\s+))|(\(.*\))|(<\/?i>)|(\u003C\/?i\u003E)|[\s.,-\/#!$%\^&\*;:{}=\-_`~"\'\\()?!]/gi,
	reVowels = /[aeiuo]/gi,
	reConsonants = /[^aeiuo]/gi;

var cats = {},
	scores = {},
	names = {},
	state = {},
	records = {};

var vowelThreshold = 0.4,
	resetDelay = 5000,
	defaultValue = 500,
	incorrectWeight = 0.05;


function Trivia () {
	this.api = api;
	this.reset = reset;
	this.sendMessage = sendMessage;
	this.showWinnings = showWinnings;
	this.generateClue = generateClue;
	this.checkAnswer = checkAnswer;
	this.state = state;
	this.categories = cats;
}

/**
 * Resets trivia, and optionally retrives the next clue.
 *
 * @yields {[type]} [description]
 */
function* reset () {
	state.answer = state.parsedAnswer = state.value = null;
	if (state.mode != mode.STOPPED) {
		state.mode = mode.INACTIVE;
		yield function (cb) {
			setTimeout(cb, resetDelay);
		};
		if (state.mode != mode.ACTIVE) yield* generateClue.call(this);
	}
}

/**
 * Make calls to the trivia API service.
 *
 * @param  {String} endpoint - The API endpoint which we wish to call.
 * @param  {String} [params] - Any parameters to be specified for the call.
 * @yields {[type]} [description]
 */
function* api (endpoint, params) {
	var res = yield req.get({
		url: `http://jservice.io/api/${endpoint}${params ? '?' : ''}${params}`
	});

	if (res.statusCode === 200 && res.body) return JSON.parse(res.body);
}

/**
 * Retrieves and displays a new trivia clue.
 *
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
function* generateClue () {
	var clue = {},
		headerText = '',
		endpoint, params, payload, category, question, value, offset;

	state.mode = mode.ACTIVE;

	if (state.categoryId) {
		endpoint = 'clues';
		offset = Math.floor(Math.random()*state.cluesCount);
		params = `category=${state.categoryId}&offset=${offset}`;
	} else {
		endpoint = 'random';
		params = 'count=1';
	}

	while (clue && (!clue.question || !clue.answer || clue.question.indexOf('>here<') > -1 || clue.question.indexOf(' here') > -1)) {
		payload = yield* api(endpoint, params);
		clue = payload[0];
	}

	category = clue.category && clue.category.title;
	question = clue.question.replace('\\', '');
	value = parseInt(clue.value, 10);

	state.answer = clue.answer.replace('\\', '');
	state.value = (isNaN(value) || !value) ? defaultValue : value;
	state.parsedAnswer = scrubAnswer.call(this, state.answer);

	if (category) {
		category = category.toUpperCase().replace('\\', '');
		cats[category] = {id: clue.category.id, count: clue.category.clues_count};
		headerText = `[<b>${category}</b> for <em>$${state.value}</em>]<br />`;
	}

	// yield this.roomClient.setRoomTopic(question);
	yield sendMessage.call(this, `${headerText}${question}`, {
		notify: true
	});
}

/**
 * Scrubs an answer (usually the original, correct answer, or a user guess), removing any articles,
 * whitespace, special characters, etc.
 *
 * @param   {String} answer - The text string to scrub.
 * @returns {String} The scrubbed answer text.
 */
function scrubAnswer (answer) {
	return latinizer.latinize(answer).replace(reScrub, '').toUpperCase();
}

/**
 * Check correctness of an answer by sorting and comparing characters. This is useful for cases
 * where there is a slight misspelling (i.e. swapped characters).
 *
 * @param   {String} guess - The guess to check.
 * @returns {Boolean} If `true`, we are classifying the guess as correct; `false` if otherwise.
 */
function checkBySorting (guess) {
	var correct = true,
		answer = state.parsedAnswer,
		arrGuess, arrAnswer,
		idx;

	if (guess && answer && guess.length == answer.length) {
		arrGuess = guess.split('');
		arrAnswer = answer.split('');
		for (idx = 0; idx < arrGuess.length; idx++) {
			if (arrGuess[idx] != arrAnswer[idx]) {
				correct = false;
				break;
			}
		}
	} else {
		correct = false;
	}

	return correct;
}

/**
 * Checks the guessed answer for correctness.
 *
 * @param  {String} guess - The guess to check.
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
function* checkAnswer (guess) {
	var scrubbedGuess, vowels, correct,
		matchesGuess, matchesAnswer,
		feedbackIdx, record;

	if (state.mode == mode.ACTIVE) {
		correct = false;

		if (guess) {
			scrubbedGuess = scrubAnswer.call(this, guess);
			vowels = scrubbedGuess.match(reVowels);

			if (scrubbedGuess.indexOf(state.parsedAnswer) > -1) { // if guess contains the answer (close enough for our purposes)
				correct = true;
			} else if (vowels && vowels.count / scrubbedGuess.length < vowelThreshold) { // compare only consonants
				matchesGuess = scrubbedGuess.match(reConsonants);
				matchesAnswer = state.parsedAnswer.match(reConsonants);

				if (matchesGuess && matchesAnswer) {
					matchesGuess = matchesGuess.join('');
					matchesAnswer = matchesAnswer.join('');
					correct = matchesGuess == matchesAnswer;

					if (!correct) {
						correct = checkBySorting.call(this, scrubbedGuess);
					}
				}
			} else { // sort by characters and compare
				correct = checkBySorting.call(this, scrubbedGuess);
			}
		}

		record = records[this.sender.id];

		if (correct) {
			scores[this.sender.id] = (scores[this.sender.id] ? scores[this.sender.id] : 0) + state.value;
			names[this.sender.id] = this.sender.name;

			if (!record) {
				record = records[this.sender.id] = { made: 1, attempts: 1 };
			} else {
				record.made++;
				record.attempts++;
			}

			yield sendMessage.call(this, `${this.sender.name} is correct! ${generateScore(this.sender.id)}<br />
				Answer: <b>${state.answer}</b>`, {notify: true, color: 'green'});

			yield* reset.call(this);
		} else {
			if (scrubbedGuess && state.parsedAnswer && state.parsedAnswer.indexOf(scrubbedGuess) > -1) {
				yield sendMessage.call(this, `${this.sender.name}: <b>Almost!</b> Try adjusting your answer slightly.`, {
					color: 'gray'
				});
				return;
			}

			scores[this.sender.id] = (scores[this.sender.id] ? scores[this.sender.id] : 0) - state.value*incorrectWeight;

			if (!record) {
				record = records[this.sender.id] = { made: 0, attempts: 1 };
			} else {
				record.attempts++;
			}

			feedbackIdx = Math.floor(Math.random()*fails.length);
			yield* sendMessage.call(this, `${this.sender.name}: ${fails[feedbackIdx]} ${generateScore(this.sender.id)}`, {
				color: 'red',
				message_format: 'text'
			});
		}
	} else {
		yield sendMessage.call(this, `Whoops! Too late, ${this.sender.name}.`, {
			color: 'red'
		});
	}
}

/**
 * Generate and display a scoreboard.
 *
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
function* showWinnings () {
	var msg = '<b>Leaderboard</b><br />',
		winnings, id, idx;

	winnings = Object.keys(scores).sort(function (a,b) { return scores[b] - scores[a]; });
	for (idx = 0; idx < winnings.length; idx++) {
		id = winnings[idx];
		msg += `${names[id]} ${generateScore(id)}<br />`;
	}
	yield sendMessage.call(this, msg);
}

/**
 * Generates the "score" (winnings and correct/incorrect record) for a given user.
 *
 * @param   {String} id - The id of the user whose score we wish to generate.
 * @returns {String} The formatted display text of the score.
 */
function generateScore (id) {
	var score = scores[id],
		record = records[id];

	return `(${score < 0 ? '-' : ''}$${Math.abs(score)} | ${record.made} for ${record.attempts})`;
}

function* sendMessage (message, options) {
	options = options || {};
	// Adapted from ac-koa-hipchat-sassy
	try {
		yield this.roomClient.sendNotification(message, {
			color: options.color || 'yellow',
			format: options.format || 'html',
			notify: options.notify || false
		});
	} catch (err) {
		console.log('error', err);
	} // prevent HipChat API errors from killing our app
}

module.exports = Trivia;
