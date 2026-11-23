import { parseCoordinatePair } from './coordinates.js?v=ui1-coordinates2';
import { parsePlusCode } from './plus-codes.js?v=ui1-plus1';
import { calculateNavigation } from './navigation.js';

const number = '[+−-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const pair = number + '(?:\\s*[,、;]\\s*|\\s+)' + number;
const coordinateBlock = '(?:\\(\\s*' + pair + '\\s*\\)|' + pair + ')';
const separator = '(?:\\s*[;|]\\s*|\\s+)';
const coordinateFirst = new RegExp('^(' + coordinateBlock + ')' + separator + '([\\s\\S]+)$');
const coordinateLast = new RegExp('^([\\s\\S]+?)' + separator + '(' + coordinateBlock + ')$');

export function parseDestinationInput(input) {
  const text = input.normalize('NFKC').trim();
  let coordinateError;
  try {
    return { ...parseCoordinatePair(text), method: 'coordinates' };
  } catch (error) {
    coordinateError = error;
  }
  for (const [pattern, coordinateIndex, codeIndex] of [[coordinateFirst, 1, 2], [coordinateLast, 2, 1]]) {
    const blocks = text.match(pattern);
    if (!blocks) continue;
    const code = parsePlusCode(blocks[codeIndex]);
    if (!code) continue;
    const coordinates = parseCoordinatePair(blocks[coordinateIndex]);
    return {
      ...code, ...coordinates, method: 'both',
      differenceMeters: calculateNavigation(coordinates, code).distanceMeters,
    };
  }
  const plusCode = parsePlusCode(text);
  if (plusCode) return { ...plusCode, method: 'plus' };
  throw coordinateError;
}
