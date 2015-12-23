# Hip Trivia
A trivia plugin, for HipChat, that utilizes the Jeopardy API located at http://jservice.io.

# How to install
This can be run as a HipChat add-on that is hosted on a machine. To do so, you can follow the instructions provided by HipChat here: https://bitbucket.org/atlassianlabs/ac-koa-hipchat/wiki/Getting_Started.

As a brief overview, you will need to do the following:
* Install the required npm dependencies via `npm install`
* Install and run your own redis server.
* If you have your own, externally-accessible web service, great. If not, use ngrok (https://ngrok.com) to setup a tunnel to your localhost.
* Run the add-on: `npm run web-dev`

# Gameplay
* After a clue is answered correctly, or when the room gives up (see below), a new trivia clue will appear shortly.
* Correct answers will result in the question's value being added to the winnings total of the answerer. Incorrect answers result in a fraction of the clue's value being deducted from winnings. Answers that are "close" (i.e. consist of a substring of the full answer) will be noted, and do not result in any change in winnings. Answers that are processed after the clue has been answered, but before the next clue has been presented, do not result in any change in winnings.
* Sometimes you will be stumped by a clue. When using hints (see below), please note that the number of hints requested will linearly decrease the clue value awarded when a correct answer is eventually given. There are currently 6 hint levels, which provide varying and increasing amounts of information about the answer.
* The add-on does its best to handle simultaneous answers, but usually the first to respond will be credited with the correct response.
* When answering, articles (i.e. "a", "an", "the", etc.) are ignored, as well as punctuation and spaces.

# Commands
* To start trivia: **/t[rivia]**
* To ask for a hint: **/t[rivia] hint**
* To answer a question: **/a[nswer] &lt;your answer&gt;**
* To list 10 (random) categories: **/t[rivia] categories**
* To set the current category (using a previously listed category): **/t[rivia] category &lt;category title&gt;**
* To reveal the current answer (don't spoil it for others!): **/t[rivia] uncle**
* To see the leaderboard: **/t[rivia] standings**
* To stop playing trivia: **/t[rivia] stop**
