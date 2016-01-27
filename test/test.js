var assert = require('assert');
var utils = require('../lib/utils');

describe('Text manipulation', function() {

	describe('Answer scrubbing', function () {

		it('should remove whitespace', function () { //punctuation, special characters
			assert.equal(utils.scrubAnswer('Time of your life'), 'TIMEOFYOURLIFE');
		});

		it('should remove articles', function () {
			assert.equal(utils.scrubAnswer('The time and temperature'), 'TIMETEMPERATURE');
		});

		it('should remove formatting (html tags)', function () {
			assert.equal(utils.scrubAnswer('<i>Time After Time</i>'), 'TIMEAFTERTIME');
		});

		it('should remove formatting (html tags) followed by an article', function () {
			assert.equal(utils.scrubAnswer('<i>The Time Machine</i>'), 'TIMEMACHINE');
		});

		it('should remove formatting (unicode)', function () {
			assert.equal(utils.scrubAnswer('\u003C\i\u003ETime After Time\u003C\/i\u003E'), 'TIMEAFTERTIME');
		});

		it('should remove formatting (unicode) followed by an article', function () {
			assert.equal(utils.scrubAnswer('\u003C\i\u003EThe Time Machine\u003C\/i\u003E'), 'TIMEMACHINE');
		});

		it('should remove terms in parentheses', function () {
			assert.equal(utils.scrubAnswer('(time) date'), 'DATE');
		});

		it('should remove terms with articles in parentheses', function () {
			assert.equal(utils.scrubAnswer('time (and date)'), 'TIME');
		});

		it('should remove dashes', function () {
			assert.equal(utils.scrubAnswer('time-to-live'), 'TIMETOLIVE');
		});

		it('should remove dashes with an article', function () {
			assert.equal(utils.scrubAnswer('time-and-date'), 'TIMEDATE');
		});

		it('should remove dashes with consecutive articles', function () {
			assert.equal(utils.scrubAnswer('time-and-a-half'), 'TIMEHALF');
		});

	});

	describe('Answer matching', function () {

		it('should match complex answers with punctuation, articles, and parentheses', function () {
			assert.equal(utils.scrubAnswer('<i>E.T. (The Extra-Terrestrial)</i>'), utils.scrubAnswer('ET'));
		});

	});

	describe('Alternate answer parsing', function () {

		it('should parse parenthesized term', function () {
			assert.equal(utils.parseAlternate('this (that)'), 'THAT');
		});

		it('should parse parenthesized term with article', function () {
			assert.equal(utils.parseAlternate('this (or that)'), 'THAT');
		});

		it('should parse slash alternate answer', function () {
			assert.equal(utils.parseAlternate('this / that'), 'THAT');
		});

		it('should parse slash alternate answer with no whitespaces', function () {
			assert.equal(utils.parseAlternate('this/that'), 'THAT');
		});

		it('should parse slash alternate answer with whitespace after primary answer', function () {
			assert.equal(utils.parseAlternate('this /that'), 'THAT');
		});

		it('should parse slash alternate answer with whitespace before alternate answer', function () {
			assert.equal(utils.parseAlternate('this/ that'), 'THAT');
		});

		it('should parse "or" alternate answer', function () {
			assert.equal(utils.parseAlternate('this or that'), 'THAT');
		});

		it('should ignore alternate answer separator that begins the string', function () {
			assert.equal(utils.parseAlternate('or that'), '');
		});

		it('should ignore alternate answer separator that appears in another term', function () {
			assert.equal(utils.parseAlternate('for that'), '');
		});

	});

	describe('NLP answer approximation', function () {

		it('should match swapped-letter guesses', function () {
			assert.equal(utils.checkBySorting(utils.scrubAnswer('michealangelo'), utils.scrubAnswer('Michaelangelo')), true);
		});

		it('should match close-enough guesses', function () {
			assert.equal(utils.checkByConsonants(utils.scrubAnswer('katherine hepburn'), utils.scrubAnswer('Katharine Hepburn'), 0.4), true);
		});

		it('should ignore close-enough guesses with primarily vowels', function () {
			assert.equal(utils.checkByConsonants(utils.scrubAnswer('googel'), utils.scrubAnswer('Google'), 0.4), false);
		});

		it('should match close-enough guesses with given a high-enough vowel threshold', function () {
			assert.equal(utils.checkByConsonants(utils.scrubAnswer('googel'), utils.scrubAnswer('Google'), 0.6), true);
		});

	})

});