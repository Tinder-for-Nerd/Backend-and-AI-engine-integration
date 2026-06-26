#!/usr/bin/env node
// Simple runner to call the existing JS recommendation engine and print JSON
import { getRecommendations } from '../src/recommendationEngine.js';

function main() {
  const arg = process.argv[2];
  let options = {};
  if (arg) {
    try {
      options = JSON.parse(arg);
    } catch (e) {
      // ignore parse errors, use defaults
    }
  }

  const result = getRecommendations(options);
  console.log(JSON.stringify(result));
}

main();
