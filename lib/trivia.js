var req = require('co-request'),
	latinizer = require('./latinizer'),
	fails = require('./fails.json'),
	modes = require('./modes');

var reScrub = /((^|\s*)(a|an|and|the|&|or)(\s+))|(\(.*\))|(<\/?i>)|(\u003C\/?i\u003E)|[\s.,-\/#!$%\^&\*;:{}=\-_`~"\'\\()?!]/gi,
	reVowels = /[aeiuo]/gi,
	reConsonants = /[^aeiuo]/gi;

var cats = {};

var vowelThreshold = 0.4,
	resetDelay = 5000,
	defaultValue = 500;

function Trivia () {
	this.api = api;
	this.reset = reset;
	this.sendMessage = sendMessage;
	this.showWinnings = showWinnings;
	this.generateClue = generateClue;
	this.checkAnswer = checkAnswer;
	this.categories = cats;

	// utils
	this.scrubAnswer = scrubAnswer;
	this.checkBySorting = checkBySorting;
	this.generateScore = generateScore;
}

/**
 * Resets trivia, and optionally retrives the next clue.
 *
 * @yields {[type]} [description]
 */
function* reset () {
	var tenant = this.tenants.getTenant(this.tenant.id);
	tenant.setState('answer', null);
	tenant.setState('parsedAnswer', null);
	tenant.setState('value', null);
	if (tenant.getState('mode') != modes.STOPPED) {
		tenant.setState('mode', modes.INACTIVE);
		yield function (cb) {
			setTimeout(cb, resetDelay);
		};
		if (tenant.getState('mode') != modes.ACTIVE) yield* this.generateClue();
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
		tenant = this.tenants.getTenant(this.tenant.id),
		endpoint, params, payload, category, categoryId, question, value, offset;

	tenant.setState('mode', modes.ACTIVE);

	categoryId = tenant.getState('categoryId');
	if (categoryId) {
		endpoint = 'clues';
		offset = Math.floor(Math.random()*tenant.getState('cluesCount'));
		params = `category=${categoryId}&offset=${offset}`;
	} else {
		endpoint = 'random';
		params = 'count=1';
	}

	while (clue && (!clue.question || !clue.answer || clue.question.indexOf('>here<') > -1 || clue.question.indexOf(' here') > -1)) {
		payload = yield* this.api(endpoint, params);
		clue = payload[0];
	}

	category = clue.category && clue.category.title;
	question = clue.question.replace('\\', '');
	value = parseInt(clue.value, 10);

	tenant.setState('answer', clue.answer.replace('\\', ''));
	tenant.setState('value', (isNaN(value) || !value) ? defaultValue : value);
	tenant.setState('parsedAnswer', this.scrubAnswer(tenant.getState('answer')));

	if (category) {
		category = category.toUpperCase().replace('\\', '');
		cats[category] = {id: clue.category.id, count: clue.category.clues_count};
		headerText = `[<b>${category}</b> for <em>$${tenant.getState('value')}</em>]<br />`;
	}

	// yield this.roomClient.setRoomTopic(question);
	yield this.sendMessage(`${headerText}${question}`, {
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
		tenant = this.tenants.getTenant(this.tenant.id),
		answer = tenant.getState('parsedAnswer'),
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
	var tenant = this.tenants.getTenant(this.tenant.id),
		scrubbedGuess, vowels, correct,
		matchesGuess, matchesAnswer,
		feedbackIdx, record;

	if (tenant.getState('mode') == modes.ACTIVE) {
		correct = false;

		if (guess) {
			scrubbedGuess = scrubAnswer(guess);
			vowels = scrubbedGuess.match(reVowels);

			if (scrubbedGuess.indexOf(tenant.getState('parsedAnswer')) > -1) { // if guess contains the answer (close enough for our purposes)
				correct = true;
			} else if (vowels && vowels.count / scrubbedGuess.length < vowelThreshold) { // compare only consonants
				matchesGuess = scrubbedGuess.match(reConsonants);
				matchesAnswer = tenant.getState('parsedAnswer').match(reConsonants);

				if (matchesGuess && matchesAnswer) {
					matchesGuess = matchesGuess.join('');
					matchesAnswer = matchesAnswer.join('');
					correct = matchesGuess == matchesAnswer;

					if (!correct) {
						correct = this.checkBySorting(scrubbedGuess);
					}
				}
			} else { // sort by characters and compare
				correct = this.checkBySorting(scrubbedGuess);
			}
		}

		if (correct) {
			record = tenant.recordGuess(this.sender, tenant.getState('value'), correct);

			yield this.sendMessage(`${this.sender.name} is correct! ${generateScore(record)}<br />
				Answer: <b>${tenant.getState('answer')}</b>`, {notify: true, color: 'green'});

			yield* this.reset();
		} else {
			if (scrubbedGuess && tenant.getState('parsedAnswer') && tenant.getState('parsedAnswer').indexOf(scrubbedGuess) > -1) {
				yield this.sendMessage(`${this.sender.name}: <b>Almost!</b> Try adjusting your answer slightly.`, {
					color: 'gray'
				});
				return;
			}

			record = tenant.recordGuess(this.sender, tenant.getState('value'), correct);

			feedbackIdx = Math.floor(Math.random()*fails.length);
			yield this.sendMessage(`${this.sender.name}: ${fails[feedbackIdx]} ${generateScore(record)}`, {
				color: 'red',
				message_format: 'text'
			});
		}
	} else {
		yield this.sendMessage(`Whoops! Too late, ${this.sender.name}.`, {
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
		tenant = this.tenants.getTenant(this.tenant.id);
		players = tenant.getPlayers(),
		winnings, player, id, idx;

	winnings = Object.keys(players).sort(function (a,b) { return players[b].winnings - players[a].winnings; });
	for (idx = 0; idx < winnings.length; idx++) {
		id = winnings[idx];
		player = tenant.getPlayer(id);
		msg += `${names[id]} ${generateScore(player)}<br />`;
	}
	yield this.sendMessage(msg);
}

/**
 * Generates the "score" (winnings and correct/incorrect record) for a given user.
 *
 * @param   {String} id - The id of the user whose score we wish to generate.
 * @returns {String} The formatted display text of the score.
 */
function generateScore (record) {
	var winnings = record.winnings;

	return `(${winnings < 0 ? '-' : ''}$${Math.abs(winnings)} | ${record.correct} for ${record.attempts})`;
}

function* sendMessage (message, options) {
	// Adapted from ac-koa-hipchat-sassy
	options = options || {};
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
