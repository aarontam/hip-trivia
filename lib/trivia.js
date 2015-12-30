var fails = require('./fails.json'),
	modes = require('./modes'),
	utils = require('./utils');

var cats = {};

// Various configurion values
var vowelThreshold = 0.4,
	resetDelay = 5000,
	defaultValue = 500,
	updateRoomTopic = false;

/**
 * Encapsulates all of the trivia functionality, exposing a number of methods to control the current
 * trivia instance.
 */
function Trivia () {}

/**
 * Resets trivia, and optionally retrives the next clue.
 *
 * @yields {[type]} [description]
 */
Trivia.prototype.reset = function* () {
	var tenant = this.tenants.getTenant(this.tenant.id);
	tenant.setState('answer', null);
	tenant.setState('parsedAnswer', null);
	tenant.setState('value', null);
	tenant.setState('hintLevel', 0);
	if (tenant.getState('mode') != modes.STOPPED) {
		tenant.setState('mode', modes.INACTIVE);
		yield function (cb) {
			setTimeout(cb, resetDelay);
		};
		if (tenant.getState('mode') != modes.ACTIVE) yield* this.generateClue();
	}
};

/**
 * Retrieves and displays a new trivia clue.
 *
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
Trivia.prototype.generateClue = function* () {
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
		payload = yield* utils.api(endpoint, params);
		clue = payload[0];
	}

	category = clue.category && clue.category.title;
	question = clue.question.replace('\\', '');
	value = parseInt(clue.value, 10);

	tenant.setState('answer', clue.answer.replace('\\', ''));
	tenant.setState('value', (isNaN(value) || !value) ? defaultValue : value);
	tenant.setState('parsedAlternate', utils.parseAlternate(tenant.getState('answer')));
	tenant.setState('parsedAnswer', utils.scrubAnswer(tenant.getState('answer')));
	tenant.setState('hints', utils.generateHints(tenant.getState('answer')));

	if (category) {
		category = category.toUpperCase().replace('\\', '');
		cats[category] = {id: clue.category.id, count: clue.category.clues_count};
		headerText = `[<b>${category}</b> for <em>$${tenant.getState('value')}</em>]<br />`;
	}

	if (updateRoomTopic) yield this.roomClient.setRoomTopic(question);

	yield this.sendMessage(`${headerText}${question}`, {
		notify: true
	});
};

/**
 * Checks the guessed answer for correctness.
 *
 * @param  {String} guess - The guess to check.
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
Trivia.prototype.checkAnswer = function* (guess) {
	var tenant = this.tenants.getTenant(this.tenant.id),
		scrubbedGuess, answer, alternate, vowels, correct,
		matchesGuess, matchesAnswer, matchesAlternate,
		feedbackIdx, record;

	if (tenant.getState('mode') == modes.ACTIVE) {
		correct = false;

		if (guess) {
			scrubbedGuess = utils.scrubAnswer(guess);
			vowels = scrubbedGuess.match(utils.reVowels);
			answer = tenant.getState('parsedAnswer');
			alternate = tenant.getState('parsedAlternate');

			if (scrubbedGuess.indexOf(answer) > -1 || (alternate && scrubbedGuess.indexOf(alternate) > -1)) { // if guess contains the answer (close enough for our purposes)
				correct = true;
			} else if (vowels && vowels.count / scrubbedGuess.length < vowelThreshold) { // compare only consonants
				matchesGuess = scrubbedGuess.match(utils.reConsonants);
				matchesAnswer = answer.match(utils.reConsonants);

				if (matchesGuess && matchesAnswer) {
					matchesGuess = matchesGuess.join('');
					matchesAnswer = matchesAnswer.join('');
					correct = matchesGuess == matchesAnswer;

					if (!correct) {
						matchesAlternate = alternate.match(utils.reConsonants);
						correct = matchesGuess == matchesAlternate;

						if (!correct) correct = utils.checkBySorting(scrubbedGuess, answer);
					}
				}
			} else { // sort by characters and compare
				correct = utils.checkBySorting(scrubbedGuess, answer) || (alternate && utils.checkBySorting(scrubbedGuess, alternate));
			}
		}

		if (correct) {
			record = tenant.recordGuess(this.sender, tenant.getState('value'), correct);

			yield this.sendMessage(`${this.sender.name} is correct! ${utils.generateScore(record)}<br />
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
			yield this.sendMessage(`${this.sender.name}: ${fails[feedbackIdx]} ${utils.generateScore(record)}`, {
				color: 'red',
				format: 'text'
			});
		}
	} else {
		yield this.sendMessage(`Whoops! Too late, ${this.sender.name}.`, {
			color: 'red'
		});
	}
};

/**
 * Generate and display a scoreboard.
 *
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
Trivia.prototype.showWinnings = function* () {
	var msg = '<b>Leaderboard</b><br />',
		tenant = this.tenants.getTenant(this.tenant.id),
		players = tenant.getPlayers(),
		winnings, player, id, idx;

	winnings = Object.keys(players).sort(function (a,b) { return players[b].winnings - players[a].winnings; });
	for (idx = 0; idx < winnings.length; idx++) {
		id = winnings[idx];
		player = tenant.getPlayer(id);
		msg += `${player.name} ${utils.generateScore(player)}<br />`;
	}
	yield this.sendMessage(msg);
};

/**
 * Displays a hint, based on the amount of hints already given for the current clue.
 *
 * @yields {String|null} The response body if successful, otherwise `null`. This is a result of
 *  attempting to send a room notification.
 */
Trivia.prototype.showHint = function* () {
	var tenant = this.tenants.getTenant(this.tenant.id),
		level = tenant.getState('hintLevel'),
		hints = tenant.getState('hints'),
		msg;

	msg = hints[level] || 'Looks like it\'s time to give up. Type <b>/t uncle</b>';
	tenant.setState('hintLevel', level + 1);
	yield this.sendMessage(`Hint ${level + 1}:&nbsp;&nbsp;${msg}`);
};

/**
 * Sends a room notification to the current room.
 *
 * @param  {String} message       The text of the message to send.
 * @param  {[Object]} options     A set of options to be passed to the `sendNotification` method.
 * @yields {String|null} The response body if successful, otherwise `null`.
 */
Trivia.prototype.sendMessage = function* (message, options) {
	// Adapted from ac-koa-hipchat-sassy
	options = options || {};
	try {
		yield this.roomClient.sendNotification(message, {
			color: options.color || 'yellow',
			format: options.format || 'html',
			notify: options.notify || false
		});
	} catch (err) {} // prevent HipChat API errors from killing our app
};

module.exports = Trivia;
