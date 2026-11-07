#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const examples=JSON.parse(readFileSync(new URL('./examples.json',import.meta.url)));
const id=process.argv[2];
if(!examples[id]){console.error('Usage: node examples.mjs 01|02|03|04|05|06|07');process.exitCode=2;}
else console.log(JSON.stringify(examples[id],null,2));
