var req = require('co-request'),
	latinizer = require('./latinizer');

// Regular expressions
var reScrub = /((^|\s+)(a|an|and|the|&|or)(\s+))|(\(.*\))|(<\/?i>)|(\u003C\/?i\u003E)|[\s.,-\/#!$%\^&\*;:{}=\-_`~"\'\\()?!]/gi,
	reVowels = /[aeiuo]/gi,
	reConsonants = /[^aeiuo]/gi,
	reNonWhitespace = /[^\s]/gi,
	reMultipleSpace = /[ ]{2,}/gi,
	reStartEndSpace = /(^\s*)|(\s*$)/gi,
	reNewLineStart = /\n /;

// Hint string helpers
var hintReplacement = ' <b>-</b> ',
	hintDelimiter = '&nbsp;&nbsp;';

/**
 * Splits a string into words. Adapted from http://stackoverflow.com/a/18679657/1569595
 *
 * @param   {String} s - The string we wish to split into words.
 * @returns {String[]} The set of words.
 */
function splitWords (s){
	s = s.replace(reStartEndSpace, ''); //exclude start and end white-space
	s = s.replace(reMultipleSpace, ' '); //2 or more space to 1
	s = s.replace(reNewLineStart, '\n'); // exclude newline with a start spacing
	return s.split(' ');
}

/**
 * Make calls to the trivia API service.
 *
 * @param  {String} endpoint - The API endpoint which we wish to call.
 * @param  {String} [params] - Any parameters to be specified for the call.
 * @yields {[type]} [description]
 */
var api = function* (endpoint, params) {
	var res = yield req.get({
		url: `http://jservice.io/api/${endpoint}${params ? '?' : ''}${params}`
	});

	if (res.statusCode === 200 && res.body) return JSON.parse(res.body);
};

/**
 * Scrubs an answer (usually the original, correct answer, or a user guess), removing any articles,
 * whitespace, special characters, etc.
 *
 * @param   {String} answer - The text string to scrub.
 * @returns {String} The scrubbed answer text.
 */
var scrubAnswer = function (answer) {
	return latinizer.latinize(answer).replace(reScrub, '').toUpperCase();
};

/**
 * Check correctness of an answer by sorting and comparing characters. This is useful for cases
 * where there is a slight misspelling (i.e. swapped characters).
 *
 * @param   {String} guess - The guess to check.
 * @param   {String} answer - The answer to check against.
 * @returns {Boolean} If `true`, we are classifying the guess as correct; `false` if otherwise.
 */
var checkBySorting = function (guess, answer) {
	var correct = true,
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
};

/**
 * Generates the various hints for differing hint levels.
 *
 * @param   {String} answer - The answer string to generate hints for.
 * @returns {Array} The set of hints, indexed by hint level.
 */
var generateHints = function (answer) {
	var hints = [],
		level1 = [],
		level2 = [],
		level3 = [],
		level4 = [],
		level5 = [],
		words = splitWords(answer),
		count = words.length,
		firstLetter, lastLetter,
		word, idx;

	// level 0: Number of words (i.e. "3 words")
	hints.push(`The answer contains ${count} word${count > 1 ? 's' : ''}.`);

	// TODO: make this more efficient
	for (idx = 0; idx < count; idx++) {
		word = words[idx].toUpperCase();
		firstLetter = word.substring(0, 1);
		lastLetter = word.substring(word.length - 1);

		// level 1: Number of characters for each word (i.e. "_ _ _  _ _ _ _ _  _ _ _ _")
		level1.push(word.replace(reNonWhitespace, hintReplacement));

		// level 2: "Starts with" letter for each word (i.e. "T _ _  G _ _ _ _  W _ _ _")
		level2.push(firstLetter + word.substring(1).replace(reNonWhitespace, hintReplacement));

		// level 3: "Starts with and ends with" letter for each word (i.e. "T _ E  G _ _ _ E  W _ _ E")
		level3.push(firstLetter
			+ (word.length > 1 ? word.substring(1, word.length - 1).replace(reNonWhitespace, hintReplacement) + lastLetter : ''));

		// level 4: Show all the vowels
		level4.push(word.replace(reConsonants, hintReplacement));

		// level 5: Show all the consonants
		level5.push(word.replace(reVowels, hintReplacement));
	}

	hints.push(level1.join(hintDelimiter));
	hints.push(level2.join(hintDelimiter));
	hints.push(level3.join(hintDelimiter));
	hints.push(level4.join(hintDelimiter));
	hints.push(level5.join(hintDelimiter));

	return hints;
};

/**
 * Generates the "score" (winnings and correct/incorrect record) for a given user.
 *
 * @param   {String} id - The id of the user whose score we wish to generate.
 * @returns {String} The formatted display text of the score.
 */
var generateScore = function (record) {
	var winnings = record.winnings;

	return `(${winnings < 0 ? '-' : ''}$${Math.abs(winnings)} | ${record.correct} for ${record.attempts})`;
};

module.exports = {
	api: api,
	scrubAnswer: scrubAnswer,
	checkBySorting: checkBySorting,
	generateHints: generateHints,
	generateScore: generateScore,
	reScrub: reScrub,
	reVowels: reVowels,
	reConsonants: reConsonants
};
