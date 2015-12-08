var ack = require('ac-koa').require('hipchat');
var pkg = require('./package.json');
var app = ack(pkg);
var req = require('co-request');

var cats = {};
var scores = {};
var names = {};
var state = {};

var mode = {
	STARTED: 0,		// trivia has been started
	ACTIVE: 1,		// active round of trivia (there is a current clue)
	INACTIVE: 2,	// trivia has started but there is no active clue
	STOPPED: 3		// trivia has been stopped
};

var feedbackMsgs = [
	'Try again!',
	'Ooh, that\'s the answer to another one, but no.',
	'Bzzzzt!',
	'You wish!',
	'Survey says... "no!"',
	'Outlook hazy, please try again.',
	'Hahaha... hahahaha... no.',
	'Womp, womp.',
	'I used to think that, but I can see the answers.',
	'Not only no, hell no.',
	'Don\'t bet on it.',
	'What\'s another word for wrong?',
	'Incorrect.',
	'No way!',
	'Keep at it...',
	'No, no, no, no.',
	'Nyet!',
	'You\'re only one right answer away from getting this!',
	'I think not.',
	'👎',
	'Nope.',
	'❌',
	'I like your answer, even though it\'s wrong',
	'What is \'wrong answer\'?',
	'"Wrong Answers" for $1000',
	'Suck it, Trebek!',
	'Ask a 5th grader.',
	'All signs point to, "no."',
	'Did you even read the question?',
	'No penalty for guessing!'/*,
	'(thumbsdown)',
	'(failed)',
	'(areyouserious)',
	'(areyoukiddingme)',
	'(wtf)',
	'(howaboutno)',
	'(hahaha)'*/
];

var vowelThreshold = 0.4;
var resetDelay = 3000;
var defaultValue = 500;

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
	if (state.mode != mode.STOPPED) {
		state.mode = mode.INACTIVE;
		yield function (cb) {
			setTimeout(cb, resetDelay);
		};
		if (state.mode != mode.ACTIVE) yield* clueFn();
	}
}

function* api(endpoint, params) {
	var res = yield req.get({
		url: 'http://jservice.io/api/' + endpoint + (params ? '?' + params : '')
	});

	if (res.statusCode === 200 && res.body) return JSON.parse(res.body);
}

function* generateClue() {
	var endpoint, params, payload, clue, category, question, value;

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
		if (state.mode == mode.ACTIVE) this.roomClient.sendNotification('Previous answer: ' + state.answer);

		category = clue.category && clue.category.title;
		question = clue.question;
		value = parseInt(clue.value, 10);

		state.answer = decodeURI(clue.answer);
		state.value = (isNaN(value) || !value) ? defaultValue : value;
		state.parsedAnswer = scrubAnswer(state.answer);
		state.mode = mode.ACTIVE;

		this.roomClient.sendNotification((category ? '[<b>' + decodeURI(category.toUpperCase()) + '</b> for <em>$' + clue.value + '</em>]<br />' : '') + decodeURI(question), {
			notify: true
		});
	}
}

function scrubAnswer(answer) {
	return latinize(answer).replace(/((^|\s*)(a|an|and|the|&)(\s+))|(\(.*\))|(<\/?i>)|(\u003C\/?i\u003E)/gi, '').replace(/[\s.,-\/#!$%\^&\*;:{}=\-_`~"\'\\()?!]/g, '').toUpperCase();
}

function* checkAnswer(guess) {
	var scrubbedGuess, vowels, correct,
		matchesGuess, matchesAnswer,
		arrGuess, arrAnswer,
		feedbackIdx, idx, resetFn;

	if (state.mode == mode.ACTIVE) {
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
											+ 'Answer: <b>' + state.answer + '</b>', {notify: true, color: 'green'});
			resetFn = reset.bind(this);
			yield* resetFn();
		} else {
			if (state.parsedAnswer.indexOf(scrubbedGuess) > -1 || scrubbedGuess.indexOf(state.parsedAnswer) > -1) {
				yield this.roomClient.sendNotification(this.sender.name + ': <b>Almost!</b> Try adjusting your answer slightly', {
					color: 'gray'
				});
				return;
			}
			feedbackIdx = Math.floor(Math.random()*feedbackMsgs.length);
			yield this.roomClient.sendNotification(this.sender.name + ': ' + feedbackMsgs[feedbackIdx], {
				color: 'red',
				message_format: 'text'
			});
		}
	} else {
		yield this.roomClient.sendNotification('Whoops! Too late, ' + this.sender.name, {
			color: 'red'
		});
	}
}

addon.webhook('room_message', /^\/(trivia|t|a|ans|answer)(?:$|\s)(?:(.+))?/, function *() {
	var slash = this.match[1],
		args = this.match[2],
		endpoint = '',
		params = '',
		checkFn, clueFn, resetFn,
		command, option,
		winnings, msg,
		id, idx,
		payload, catInfo;

	switch (slash) {
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
						yield* checkFn(option);
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
															+  'To stop playing trivia: <b>/trivia stop</b>' + '<br />'
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
					case 'stop':
					case 'quit':
					case 'q':
					case 'end':
						state.mode = mode.STOPPED;
						yield this.roomClient.sendNotification('No more trivia!');
						resetFn = reset.bind(this);
						yield* resetFn();
						break;
				}
			} else {
				if (typeof state.mode === 'undefined' || state.mode == mode.STOPPED) {
					yield this.roomClient.sendNotification('Trivia...HAS BEGUN!');
					state.mode = mode.STARTED;
					clueFn = generateClue.bind(this);
					yield* clueFn();
				}
			}

			break;
	}
});

// Adapted from http://stackoverflow.com/a/9667817
var Latinise={};Latinise.latin_map={"Á":"A","Ă":"A","Ắ":"A","Ặ":"A","Ằ":"A","Ẳ":"A","Ẵ":"A","Ǎ":"A","Â":"A","Ấ":"A","Ậ":"A","Ầ":"A","Ẩ":"A","Ẫ":"A","Ä":"A","Ǟ":"A","Ȧ":"A","Ǡ":"A","Ạ":"A","Ȁ":"A","À":"A","Ả":"A","Ȃ":"A","Ā":"A","Ą":"A","Å":"A","Ǻ":"A","Ḁ":"A","Ⱥ":"A","Ã":"A","Ꜳ":"AA","Æ":"AE","Ǽ":"AE","Ǣ":"AE","Ꜵ":"AO","Ꜷ":"AU","Ꜹ":"AV","Ꜻ":"AV","Ꜽ":"AY","Ḃ":"B","Ḅ":"B","Ɓ":"B","Ḇ":"B","Ƀ":"B","Ƃ":"B","Ć":"C","Č":"C","Ç":"C","Ḉ":"C","Ĉ":"C","Ċ":"C","Ƈ":"C","Ȼ":"C","Ď":"D","Ḑ":"D","Ḓ":"D","Ḋ":"D","Ḍ":"D","Ɗ":"D","Ḏ":"D","ǲ":"D","ǅ":"D","Đ":"D","Ƌ":"D","Ǳ":"DZ","Ǆ":"DZ","É":"E","Ĕ":"E","Ě":"E","Ȩ":"E","Ḝ":"E","Ê":"E","Ế":"E","Ệ":"E","Ề":"E","Ể":"E","Ễ":"E","Ḙ":"E","Ë":"E","Ė":"E","Ẹ":"E","Ȅ":"E","È":"E","Ẻ":"E","Ȇ":"E","Ē":"E","Ḗ":"E","Ḕ":"E","Ę":"E","Ɇ":"E","Ẽ":"E","Ḛ":"E","Ꝫ":"ET","Ḟ":"F","Ƒ":"F","Ǵ":"G","Ğ":"G","Ǧ":"G","Ģ":"G","Ĝ":"G","Ġ":"G","Ɠ":"G","Ḡ":"G","Ǥ":"G","Ḫ":"H","Ȟ":"H","Ḩ":"H","Ĥ":"H","Ⱨ":"H","Ḧ":"H","Ḣ":"H","Ḥ":"H","Ħ":"H","Í":"I","Ĭ":"I","Ǐ":"I","Î":"I","Ï":"I","Ḯ":"I","İ":"I","Ị":"I","Ȉ":"I","Ì":"I","Ỉ":"I","Ȋ":"I","Ī":"I","Į":"I","Ɨ":"I","Ĩ":"I","Ḭ":"I","Ꝺ":"D","Ꝼ":"F","Ᵹ":"G","Ꞃ":"R","Ꞅ":"S","Ꞇ":"T","Ꝭ":"IS","Ĵ":"J","Ɉ":"J","Ḱ":"K","Ǩ":"K","Ķ":"K","Ⱪ":"K","Ꝃ":"K","Ḳ":"K","Ƙ":"K","Ḵ":"K","Ꝁ":"K","Ꝅ":"K","Ĺ":"L","Ƚ":"L","Ľ":"L","Ļ":"L","Ḽ":"L","Ḷ":"L","Ḹ":"L","Ⱡ":"L","Ꝉ":"L","Ḻ":"L","Ŀ":"L","Ɫ":"L","ǈ":"L","Ł":"L","Ǉ":"LJ","Ḿ":"M","Ṁ":"M","Ṃ":"M","Ɱ":"M","Ń":"N","Ň":"N","Ņ":"N","Ṋ":"N","Ṅ":"N","Ṇ":"N","Ǹ":"N","Ɲ":"N","Ṉ":"N","Ƞ":"N","ǋ":"N","Ñ":"N","Ǌ":"NJ","Ó":"O","Ŏ":"O","Ǒ":"O","Ô":"O","Ố":"O","Ộ":"O","Ồ":"O","Ổ":"O","Ỗ":"O","Ö":"O","Ȫ":"O","Ȯ":"O","Ȱ":"O","Ọ":"O","Ő":"O","Ȍ":"O","Ò":"O","Ỏ":"O","Ơ":"O","Ớ":"O","Ợ":"O","Ờ":"O","Ở":"O","Ỡ":"O","Ȏ":"O","Ꝋ":"O","Ꝍ":"O","Ō":"O","Ṓ":"O","Ṑ":"O","Ɵ":"O","Ǫ":"O","Ǭ":"O","Ø":"O","Ǿ":"O","Õ":"O","Ṍ":"O","Ṏ":"O","Ȭ":"O","Ƣ":"OI","Ꝏ":"OO","Ɛ":"E","Ɔ":"O","Ȣ":"OU","Ṕ":"P","Ṗ":"P","Ꝓ":"P","Ƥ":"P","Ꝕ":"P","Ᵽ":"P","Ꝑ":"P","Ꝙ":"Q","Ꝗ":"Q","Ŕ":"R","Ř":"R","Ŗ":"R","Ṙ":"R","Ṛ":"R","Ṝ":"R","Ȑ":"R","Ȓ":"R","Ṟ":"R","Ɍ":"R","Ɽ":"R","Ꜿ":"C","Ǝ":"E","Ś":"S","Ṥ":"S","Š":"S","Ṧ":"S","Ş":"S","Ŝ":"S","Ș":"S","Ṡ":"S","Ṣ":"S","Ṩ":"S","Ť":"T","Ţ":"T","Ṱ":"T","Ț":"T","Ⱦ":"T","Ṫ":"T","Ṭ":"T","Ƭ":"T","Ṯ":"T","Ʈ":"T","Ŧ":"T","Ɐ":"A","Ꞁ":"L","Ɯ":"M","Ʌ":"V","Ꜩ":"TZ","Ú":"U","Ŭ":"U","Ǔ":"U","Û":"U","Ṷ":"U","Ü":"U","Ǘ":"U","Ǚ":"U","Ǜ":"U","Ǖ":"U","Ṳ":"U","Ụ":"U","Ű":"U","Ȕ":"U","Ù":"U","Ủ":"U","Ư":"U","Ứ":"U","Ự":"U","Ừ":"U","Ử":"U","Ữ":"U","Ȗ":"U","Ū":"U","Ṻ":"U","Ų":"U","Ů":"U","Ũ":"U","Ṹ":"U","Ṵ":"U","Ꝟ":"V","Ṿ":"V","Ʋ":"V","Ṽ":"V","Ꝡ":"VY","Ẃ":"W","Ŵ":"W","Ẅ":"W","Ẇ":"W","Ẉ":"W","Ẁ":"W","Ⱳ":"W","Ẍ":"X","Ẋ":"X","Ý":"Y","Ŷ":"Y","Ÿ":"Y","Ẏ":"Y","Ỵ":"Y","Ỳ":"Y","Ƴ":"Y","Ỷ":"Y","Ỿ":"Y","Ȳ":"Y","Ɏ":"Y","Ỹ":"Y","Ź":"Z","Ž":"Z","Ẑ":"Z","Ⱬ":"Z","Ż":"Z","Ẓ":"Z","Ȥ":"Z","Ẕ":"Z","Ƶ":"Z","Ĳ":"IJ","Œ":"OE","ᴀ":"A","ᴁ":"AE","ʙ":"B","ᴃ":"B","ᴄ":"C","ᴅ":"D","ᴇ":"E","ꜰ":"F","ɢ":"G","ʛ":"G","ʜ":"H","ɪ":"I","ʁ":"R","ᴊ":"J","ᴋ":"K","ʟ":"L","ᴌ":"L","ᴍ":"M","ɴ":"N","ᴏ":"O","ɶ":"OE","ᴐ":"O","ᴕ":"OU","ᴘ":"P","ʀ":"R","ᴎ":"N","ᴙ":"R","ꜱ":"S","ᴛ":"T","ⱻ":"E","ᴚ":"R","ᴜ":"U","ᴠ":"V","ᴡ":"W","ʏ":"Y","ᴢ":"Z","á":"a","ă":"a","ắ":"a","ặ":"a","ằ":"a","ẳ":"a","ẵ":"a","ǎ":"a","â":"a","ấ":"a","ậ":"a","ầ":"a","ẩ":"a","ẫ":"a","ä":"a","ǟ":"a","ȧ":"a","ǡ":"a","ạ":"a","ȁ":"a","à":"a","ả":"a","ȃ":"a","ā":"a","ą":"a","ᶏ":"a","ẚ":"a","å":"a","ǻ":"a","ḁ":"a","ⱥ":"a","ã":"a","ꜳ":"aa","æ":"ae","ǽ":"ae","ǣ":"ae","ꜵ":"ao","ꜷ":"au","ꜹ":"av","ꜻ":"av","ꜽ":"ay","ḃ":"b","ḅ":"b","ɓ":"b","ḇ":"b","ᵬ":"b","ᶀ":"b","ƀ":"b","ƃ":"b","ɵ":"o","ć":"c","č":"c","ç":"c","ḉ":"c","ĉ":"c","ɕ":"c","ċ":"c","ƈ":"c","ȼ":"c","ď":"d","ḑ":"d","ḓ":"d","ȡ":"d","ḋ":"d","ḍ":"d","ɗ":"d","ᶑ":"d","ḏ":"d","ᵭ":"d","ᶁ":"d","đ":"d","ɖ":"d","ƌ":"d","ı":"i","ȷ":"j","ɟ":"j","ʄ":"j","ǳ":"dz","ǆ":"dz","é":"e","ĕ":"e","ě":"e","ȩ":"e","ḝ":"e","ê":"e","ế":"e","ệ":"e","ề":"e","ể":"e","ễ":"e","ḙ":"e","ë":"e","ė":"e","ẹ":"e","ȅ":"e","è":"e","ẻ":"e","ȇ":"e","ē":"e","ḗ":"e","ḕ":"e","ⱸ":"e","ę":"e","ᶒ":"e","ɇ":"e","ẽ":"e","ḛ":"e","ꝫ":"et","ḟ":"f","ƒ":"f","ᵮ":"f","ᶂ":"f","ǵ":"g","ğ":"g","ǧ":"g","ģ":"g","ĝ":"g","ġ":"g","ɠ":"g","ḡ":"g","ᶃ":"g","ǥ":"g","ḫ":"h","ȟ":"h","ḩ":"h","ĥ":"h","ⱨ":"h","ḧ":"h","ḣ":"h","ḥ":"h","ɦ":"h","ẖ":"h","ħ":"h","ƕ":"hv","í":"i","ĭ":"i","ǐ":"i","î":"i","ï":"i","ḯ":"i","ị":"i","ȉ":"i","ì":"i","ỉ":"i","ȋ":"i","ī":"i","į":"i","ᶖ":"i","ɨ":"i","ĩ":"i","ḭ":"i","ꝺ":"d","ꝼ":"f","ᵹ":"g","ꞃ":"r","ꞅ":"s","ꞇ":"t","ꝭ":"is","ǰ":"j","ĵ":"j","ʝ":"j","ɉ":"j","ḱ":"k","ǩ":"k","ķ":"k","ⱪ":"k","ꝃ":"k","ḳ":"k","ƙ":"k","ḵ":"k","ᶄ":"k","ꝁ":"k","ꝅ":"k","ĺ":"l","ƚ":"l","ɬ":"l","ľ":"l","ļ":"l","ḽ":"l","ȴ":"l","ḷ":"l","ḹ":"l","ⱡ":"l","ꝉ":"l","ḻ":"l","ŀ":"l","ɫ":"l","ᶅ":"l","ɭ":"l","ł":"l","ǉ":"lj","ſ":"s","ẜ":"s","ẛ":"s","ẝ":"s","ḿ":"m","ṁ":"m","ṃ":"m","ɱ":"m","ᵯ":"m","ᶆ":"m","ń":"n","ň":"n","ņ":"n","ṋ":"n","ȵ":"n","ṅ":"n","ṇ":"n","ǹ":"n","ɲ":"n","ṉ":"n","ƞ":"n","ᵰ":"n","ᶇ":"n","ɳ":"n","ñ":"n","ǌ":"nj","ó":"o","ŏ":"o","ǒ":"o","ô":"o","ố":"o","ộ":"o","ồ":"o","ổ":"o","ỗ":"o","ö":"o","ȫ":"o","ȯ":"o","ȱ":"o","ọ":"o","ő":"o","ȍ":"o","ò":"o","ỏ":"o","ơ":"o","ớ":"o","ợ":"o","ờ":"o","ở":"o","ỡ":"o","ȏ":"o","ꝋ":"o","ꝍ":"o","ⱺ":"o","ō":"o","ṓ":"o","ṑ":"o","ǫ":"o","ǭ":"o","ø":"o","ǿ":"o","õ":"o","ṍ":"o","ṏ":"o","ȭ":"o","ƣ":"oi","ꝏ":"oo","ɛ":"e","ᶓ":"e","ɔ":"o","ᶗ":"o","ȣ":"ou","ṕ":"p","ṗ":"p","ꝓ":"p","ƥ":"p","ᵱ":"p","ᶈ":"p","ꝕ":"p","ᵽ":"p","ꝑ":"p","ꝙ":"q","ʠ":"q","ɋ":"q","ꝗ":"q","ŕ":"r","ř":"r","ŗ":"r","ṙ":"r","ṛ":"r","ṝ":"r","ȑ":"r","ɾ":"r","ᵳ":"r","ȓ":"r","ṟ":"r","ɼ":"r","ᵲ":"r","ᶉ":"r","ɍ":"r","ɽ":"r","ↄ":"c","ꜿ":"c","ɘ":"e","ɿ":"r","ś":"s","ṥ":"s","š":"s","ṧ":"s","ş":"s","ŝ":"s","ș":"s","ṡ":"s","ṣ":"s","ṩ":"s","ʂ":"s","ᵴ":"s","ᶊ":"s","ȿ":"s","ɡ":"g","ᴑ":"o","ᴓ":"o","ᴝ":"u","ť":"t","ţ":"t","ṱ":"t","ț":"t","ȶ":"t","ẗ":"t","ⱦ":"t","ṫ":"t","ṭ":"t","ƭ":"t","ṯ":"t","ᵵ":"t","ƫ":"t","ʈ":"t","ŧ":"t","ᵺ":"th","ɐ":"a","ᴂ":"ae","ǝ":"e","ᵷ":"g","ɥ":"h","ʮ":"h","ʯ":"h","ᴉ":"i","ʞ":"k","ꞁ":"l","ɯ":"m","ɰ":"m","ᴔ":"oe","ɹ":"r","ɻ":"r","ɺ":"r","ⱹ":"r","ʇ":"t","ʌ":"v","ʍ":"w","ʎ":"y","ꜩ":"tz","ú":"u","ŭ":"u","ǔ":"u","û":"u","ṷ":"u","ü":"u","ǘ":"u","ǚ":"u","ǜ":"u","ǖ":"u","ṳ":"u","ụ":"u","ű":"u","ȕ":"u","ù":"u","ủ":"u","ư":"u","ứ":"u","ự":"u","ừ":"u","ử":"u","ữ":"u","ȗ":"u","ū":"u","ṻ":"u","ų":"u","ᶙ":"u","ů":"u","ũ":"u","ṹ":"u","ṵ":"u","ᵫ":"ue","ꝸ":"um","ⱴ":"v","ꝟ":"v","ṿ":"v","ʋ":"v","ᶌ":"v","ⱱ":"v","ṽ":"v","ꝡ":"vy","ẃ":"w","ŵ":"w","ẅ":"w","ẇ":"w","ẉ":"w","ẁ":"w","ⱳ":"w","ẘ":"w","ẍ":"x","ẋ":"x","ᶍ":"x","ý":"y","ŷ":"y","ÿ":"y","ẏ":"y","ỵ":"y","ỳ":"y","ƴ":"y","ỷ":"y","ỿ":"y","ȳ":"y","ẙ":"y","ɏ":"y","ỹ":"y","ź":"z","ž":"z","ẑ":"z","ʑ":"z","ⱬ":"z","ż":"z","ẓ":"z","ȥ":"z","ẕ":"z","ᵶ":"z","ᶎ":"z","ʐ":"z","ƶ":"z","ɀ":"z","ﬀ":"ff","ﬃ":"ffi","ﬄ":"ffl","ﬁ":"fi","ﬂ":"fl","ĳ":"ij","œ":"oe","ﬆ":"st","ₐ":"a","ₑ":"e","ᵢ":"i","ⱼ":"j","ₒ":"o","ᵣ":"r","ᵤ":"u","ᵥ":"v","ₓ":"x"};
function latinize(str) {return str.replace(/[^A-Za-z0-9\[\] ]/g,function(a){return Latinise.latin_map[a]||a;});}

app.listen();
