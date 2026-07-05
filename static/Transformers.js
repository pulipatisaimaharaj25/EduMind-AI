// Browser lo locally run avutundi — no API key needed!
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers';

const classifier = await pipeline('text-classification');
const result = await classifier('Is this Math or Science?');
