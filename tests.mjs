import test from "node:test";
import assert from "node:assert/strict";
import {
  ANSWERS, VALID_WORDS, utcKey, dayNumber, puzzleNumber, dailyAnswer, validWord,
  scoreGuess, guessFeedback, keyboardHints, freshGame, hydrateGame, initialStats, normalizeStats,
  recordResult, chooseWildAnswer, shareText
} from "./logic.mjs";
test("large offline dictionary and curated valid answers", () => {
  assert.ok(VALID_WORDS.size > 14000);
  assert.ok(ANSWERS.length > 250);
  assert.ok(ANSWERS.every(word => /^[A-Z]{5}$/.test(word) && validWord(word)));
  for(const word of ["APPLE","CRANE","ROAST","MUSIC","SILLY"]) assert.ok(validWord(word));
  assert.equal(validWord("ABCDE"),false);
  assert.equal(validWord("12345"),false);
});
test("repeat-letter scoring consumes exact matches first", () => {
  assert.deepEqual(scoreGuess("ALLEY","APPLE"),["correct","present","absent","present","absent"]);
  assert.deepEqual(scoreGuess("PUPPY","HAPPY"),["absent","absent","correct","correct","correct"]);
  assert.deepEqual(scoreGuess("BANAL","CANAL"),["absent","correct","correct","correct","correct"]);
  assert.deepEqual(scoreGuess("LEECH","EERIE"),["absent","correct","present","absent","absent"]);
});
test("inline feedback uses explicit counts for exact, misplaced and absent letters", () => {
  assert.equal(guessFeedback("CRANE","APPLE"),"1 RIGHT · 1 ELSEWHERE · 3 OUT");
  assert.equal(guessFeedback("ALLEY","APPLE"),"1 RIGHT · 2 ELSEWHERE · 2 OUT");
  assert.equal(guessFeedback("APPLE","APPLE"),"5 RIGHT · 0 ELSEWHERE · 0 OUT");
  assert.throws(() => guessFeedback("BAD","APPLE"),TypeError);
});
test("keyboard hints preserve strongest prior evidence", () => {
  assert.deepEqual(keyboardHints(["ALLEY","APPLE"],"APPLE"),{A:"correct",L:"correct",E:"correct",Y:"absent",P:"correct"});
});
test("daily puzzle is deterministic and UTC stable across time zones", () => {
  const sameDay=["2026-10-29T02:00:00Z","2026-10-28T22:00:00-04:00","2026-10-29T11:00:00+09:00"];
  const solutions=sameDay.map(x=>dailyAnswer(new Date(x)));
  assert.equal(new Set(solutions).size,1);
  assert.equal(utcKey(new Date(sameDay[1])),"2026-10-29");
  assert.equal(puzzleNumber(new Date("2026-10-29T09:00:00Z")),1);
  const days=Array.from({length:ANSWERS.length},(_,n)=>dailyAnswer(new Date(Date.UTC(2026,9,29+n))));
  assert.equal(new Set(days).size,ANSWERS.length);
});
test("hydration validates identity, word, count, finished and partial input", () => {
  const fresh=freshGame("daily:2026-10-29","APPLE");
  assert.deepEqual(hydrateGame({...fresh,current:"CR"},fresh.id,"APPLE"),{...fresh,current:"CR"});
  assert.equal(hydrateGame({...fresh,id:"wrong"},fresh.id,"APPLE"),null);
  assert.equal(hydrateGame({...fresh,guesses:["ZZZZZ"]},fresh.id,"APPLE"),null);
  assert.equal(hydrateGame({...fresh,guesses:Array(7).fill("CRANE")},fresh.id,"APPLE"),null);
  assert.equal(hydrateGame({...fresh,guesses:["APPLE","CRANE"]},fresh.id,"APPLE"),null);
  const win=hydrateGame({...fresh,guesses:["CRANE","APPLE"],current:"CLOUD"},fresh.id,"APPLE");
  assert.equal(win.finished,true); assert.equal(win.won,true); assert.equal(win.current,"");
});
test("stats: daily wins, loss, consecutive UTC dates and corruption", () => {
  let stats=initialStats();
  const win={...freshGame("d","APPLE"),guesses:["CRANE","APPLE"],finished:true,won:true};
  stats=recordResult(stats,win,"daily",new Date("2026-10-29T10:00:00Z"));
  stats=recordResult(stats,win,"daily",new Date("2026-10-30T10:00:00Z"));
  assert.equal(stats.played,2);assert.equal(stats.wins,2);assert.equal(stats.currentStreak,2);assert.equal(stats.bestStreak,2);assert.equal(stats.distribution[1],2);
  stats=recordResult(stats,{...win,won:false},"daily",new Date("2026-10-31T10:00:00Z"));
  assert.equal(stats.currentStreak,0);
  assert.deepEqual(normalizeStats({played:"hacked",wins:-5,distribution:[-2]}),initialStats());
});
test("wild mode excludes recently seen answers", () => {
  assert.ok(ANSWERS.includes(chooseWildAnswer(["GROVE","BLOOM"],()=>0)));
  const chosen=chooseWildAnswer(["GROVE","BLOOM"],()=>0);
  assert.notEqual(chosen,"GROVE");assert.notEqual(chosen,"BLOOM");
});
test("share does not reveal secret answer except the played colored rows", () => {
  const game={...freshGame("daily:2026-10-29","APPLE"),guesses:["CRANE","APPLE"],finished:true,won:true};
  const share=shareText(game,"daily",new Date("2026-10-29T20:00:00Z"),"https://example.com");
  assert.match(share,/BRANDLE #1 2\/6/);assert.match(share,/🟩/);assert.match(share,/https:\/\/example.com/);
  assert.doesNotMatch(share,/APPLE/);
});
