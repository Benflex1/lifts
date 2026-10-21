import { parse } from 'react-native-svg';
import { reportError } from './errorReporting';

type ParsedSvgAst = ReturnType<typeof parse>;

// Parsing a large inline SVG costs milliseconds and the resulting AST is
// immutable, so each bundled asset is parsed once per process instead of once
// per mount (plank and guide visuals mount repeatedly during workouts).
const astCache = new Map<string, ParsedSvgAst | null>();

/**
 * Returns the parsed AST for `xml`, parsing it at most once per `cacheKey`.
 * Failed parses are cached as `null` so a broken asset is only reported once.
 */
export function getParsedSvgAst(cacheKey: string, xml: string): ParsedSvgAst {
  const cached = astCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let ast: ParsedSvgAst = null;
  try {
    ast = parse(xml);
  } catch (error) {
    reportError(error, { scope: 'svg.asset-parse', cacheKey });
  }
  astCache.set(cacheKey, ast);
  return ast;
}

export function clearParsedSvgAstCache(): void {
  astCache.clear();
}
