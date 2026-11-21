/**
 * Safe, zero-dependency mathematical and logical expression parser and evaluator for goal formulas.
 * Replaces the vulnerable `expr-eval` package with a fully encapsulated recursive-descent parser.
 *
 * Guarantees:
 * - No `eval` or `new Function` usage (100% immune to arbitrary code execution).
 * - No prototype traversal or property access syntax (100% immune to Prototype Pollution).
 * - Safe variable lookup restricted to own properties of the provided context.
 * - Recursion depth limit to protect against stack exhaustion.
 */

export type ExpressionValue = number | string | boolean | null | undefined;

export interface EvaluationContext {
  [key: string]: unknown;
}

export interface ParsedExpression {
  evaluate: (context?: EvaluationContext) => ExpressionValue;
}

export type CustomFunction = (...args: ExpressionValue[]) => ExpressionValue;

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'IDENT'
  | 'OP'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'EOF';

type PrimitiveValue = string | number | boolean;

interface Token {
  type: TokenType;
  value: PrimitiveValue;
  pos: number;
}

type ASTNode =
  | { type: 'Literal'; value: PrimitiveValue }
  | { type: 'Identifier'; name: string }
  | { type: 'UnaryOp'; op: '-' | '!'; argument: ASTNode }
  | { type: 'BinaryOp'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'Call'; callee: string; args: ASTNode[] };

const SAFE_MATH_FUNCTIONS: Record<string, (...args: number[]) => number> = {
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
  round: x => Math.round(x),
  floor: x => Math.floor(x),
  ceil: x => Math.ceil(x),
  abs: x => Math.abs(x),
  clamp: (val, min, max) => Math.min(Math.max(val, min), max)
};

function readStringToken(input: string, startPos: number): { token: Token; nextIndex: number } {
  const quote = input[startPos];
  let i = startPos + 1;
  let str = '';

  while (i < input.length && input[i] !== quote) {
    if (input[i] === '\\' && i + 1 < input.length) {
      i++;
      const esc = input[i];
      if (esc === 'n') str += '\n';
      else if (esc === 't') str += '\t';
      else str += esc;
    } else {
      str += input[i];
    }
    i++;
  }

  if (i >= input.length) {
    throw new Error(`Unterminated string literal starting at position ${startPos}`);
  }

  i++; // Skip closing quote
  return {
    token: { type: 'STRING', value: str, pos: startPos },
    nextIndex: i
  };
}

function readNumberToken(input: string, startPos: number): { token: Token; nextIndex: number } {
  let i = startPos;
  let numStr = '';

  while (i < input.length && (/\d/.test(input[i]) || input[i] === '.')) {
    numStr += input[i++];
  }

  const numVal = Number(numStr);
  if (Number.isNaN(numVal)) {
    throw new TypeError(`Invalid number '${numStr}' at position ${startPos}`);
  }

  return {
    token: { type: 'NUMBER', value: numVal, pos: startPos },
    nextIndex: i
  };
}

function readIdentToken(input: string, startPos: number): { token: Token; nextIndex: number } {
  let i = startPos;
  let ident = '';

  while (i < input.length && /\w/.test(input[i])) {
    ident += input[i++];
  }

  const lower = ident.toLowerCase();
  let type: TokenType = 'IDENT';
  let value: PrimitiveValue = ident;

  if (lower === 'and') {
    type = 'OP';
    value = '&&';
  } else if (lower === 'or') {
    type = 'OP';
    value = '||';
  } else if (lower === 'not') {
    type = 'OP';
    value = '!';
  } else if (lower === 'true') {
    type = 'BOOLEAN';
    value = true;
  } else if (lower === 'false') {
    type = 'BOOLEAN';
    value = false;
  }

  return {
    token: { type, value, pos: startPos },
    nextIndex: i
  };
}

const TWO_CHAR_OPS = new Set(['>=', '<=', '==', '!=', '&&', '||']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '^', '>', '<', '!']);

const DELIMITER_TYPES: Record<string, TokenType> = {
  '(': 'LPAREN',
  ')': 'RPAREN',
  ',': 'COMMA'
};

function readNextToken(input: string, i: number): { token: Token; nextIndex: number } {
  const ch = input[i];

  if (ch === '"' || ch === "'") {
    return readStringToken(input, i);
  }

  if (/\d/.test(ch) || (ch === '.' && /\d/.test(input[i + 1] ?? ''))) {
    return readNumberToken(input, i);
  }

  const next2 = input.slice(i, i + 2);
  if (TWO_CHAR_OPS.has(next2)) {
    return { token: { type: 'OP', value: next2, pos: i }, nextIndex: i + 2 };
  }

  if (ONE_CHAR_OPS.has(ch)) {
    return { token: { type: 'OP', value: ch, pos: i }, nextIndex: i + 1 };
  }

  const delimType = DELIMITER_TYPES[ch];
  if (delimType) {
    return { token: { type: delimType, value: ch, pos: i }, nextIndex: i + 1 };
  }

  if (/[a-zA-Z_]/.test(ch)) {
    return readIdentToken(input, i);
  }

  throw new Error(`Unexpected character '${ch}' at position ${i}`);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    const res = readNextToken(input, i);
    tokens.push(res.token);
    i = res.nextIndex;
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

class TokenParser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', pos: this.pos };
  }

  private next(): Token {
    const token = this.peek();
    this.pos++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.next();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Expected '${value || type}' at position ${token.pos}, got '${token.value}'`);
    }
    return token;
  }

  public parse(): ASTNode {
    const ast = this.parseLogicalOr();
    if (this.peek().type !== 'EOF') {
      throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
    }
    return ast;
  }

  private checkRecursionLimit(): void {
    if (this.depth > 64) {
      throw new Error('Expression recursion limit exceeded');
    }
  }

  // Precedence level 1: ||
  private parseLogicalOr(): ASTNode {
    this.depth++;
    this.checkRecursionLimit();
    let left = this.parseLogicalAnd();
    while (this.peek().type === 'OP' && this.peek().value === '||') {
      const op = this.next().value as string;
      const right = this.parseLogicalAnd();
      left = { type: 'BinaryOp', op, left, right };
    }
    this.depth--;
    return left;
  }

  // Precedence level 2: &&
  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.peek().type === 'OP' && this.peek().value === '&&') {
      const op = this.next().value as string;
      const right = this.parseEquality();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // Precedence level 3: ==, !=
  private parseEquality(): ASTNode {
    let left = this.parseRelational();
    while (this.peek().type === 'OP' && ['==', '!='].includes(this.peek().value as string)) {
      const op = this.next().value as string;
      const right = this.parseRelational();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // Precedence level 4: <, <=, >, >=
  private parseRelational(): ASTNode {
    let left = this.parseAdditive();
    while (
      this.peek().type === 'OP' &&
      ['<', '<=', '>', '>='].includes(this.peek().value as string)
    ) {
      const op = this.next().value as string;
      const right = this.parseAdditive();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // Precedence level 5: +, -
  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'OP' && ['+', '-'].includes(this.peek().value as string)) {
      const op = this.next().value as string;
      const right = this.parseMultiplicative();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // Precedence level 6: *, /, %
  private parseMultiplicative(): ASTNode {
    let left = this.parseExponent();
    while (this.peek().type === 'OP' && ['*', '/', '%'].includes(this.peek().value as string)) {
      const op = this.next().value as string;
      const right = this.parseExponent();
      left = { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // Precedence level 7: ^ (right-associative)
  private parseExponent(): ASTNode {
    const left = this.parseUnary();
    if (this.peek().type === 'OP' && this.peek().value === '^') {
      const op = this.next().value as string;
      const right = this.parseExponent();
      return { type: 'BinaryOp', op, left, right };
    }
    return left;
  }

  // Precedence level 8: Unary -, !
  private parseUnary(): ASTNode {
    if (this.peek().type === 'OP' && (this.peek().value === '-' || this.peek().value === '!')) {
      const op = this.next().value as '-' | '!';
      const argument = this.parseUnary();
      return { type: 'UnaryOp', op, argument };
    }
    return this.parsePrimary();
  }

  // Precedence level 9: Primary
  private parsePrimary(): ASTNode {
    const token = this.peek();

    if (token.type === 'NUMBER' || token.type === 'STRING' || token.type === 'BOOLEAN') {
      this.next();
      return { type: 'Literal', value: token.value as number | string | boolean };
    }

    if (token.type === 'LPAREN') {
      this.next();
      const expr = this.parseLogicalOr();
      this.expect('RPAREN', ')');
      return expr;
    }

    if (token.type === 'IDENT') {
      const name = token.value as string;
      this.next();

      if (this.peek().type === 'LPAREN') {
        this.next();
        const args: ASTNode[] = [];
        if (this.peek().type !== 'RPAREN') {
          args.push(this.parseLogicalOr());
          while (this.peek().type === 'COMMA') {
            this.next();
            args.push(this.parseLogicalOr());
          }
        }
        this.expect('RPAREN', ')');
        return { type: 'Call', callee: name, args };
      }

      return { type: 'Identifier', name };
    }

    throw new Error(`Unexpected token '${token.value}' at position ${token.pos}`);
  }
}

function toNum(val: ExpressionValue): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string') {
    const parsed = Number(val);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function toBool(val: ExpressionValue): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val.length > 0;
  return Boolean(val);
}

function evaluateArithmeticOp(
  op: string,
  left: ExpressionValue,
  right: ExpressionValue
): ExpressionValue {
  switch (op) {
    case '+':
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left ?? '') + String(right ?? '');
      }
      return toNum(left) + toNum(right);
    case '-':
      return toNum(left) - toNum(right);
    case '*':
      return toNum(left) * toNum(right);
    case '/': {
      const divisor = toNum(right);
      if (divisor === 0) {
        throw new Error('Division by zero');
      }
      return toNum(left) / divisor;
    }
    case '%': {
      const divisor = toNum(right);
      if (divisor === 0) {
        throw new Error('Modulo by zero');
      }
      return toNum(left) % divisor;
    }
    case '^':
      return Math.pow(toNum(left), toNum(right));
    default:
      throw new Error(`Unknown arithmetic operator '${op}'`);
  }
}

function evaluateComparisonOp(op: string, left: ExpressionValue, right: ExpressionValue): boolean {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return toNum(left) < toNum(right);
    case '<=':
      return toNum(left) <= toNum(right);
    case '>':
      return toNum(left) > toNum(right);
    case '>=':
      return toNum(left) >= toNum(right);
    default:
      throw new Error(`Unknown comparison operator '${op}'`);
  }
}

function evaluateBinaryOp(
  node: Extract<ASTNode, { type: 'BinaryOp' }>,
  context: EvaluationContext | undefined,
  functions: Record<string, CustomFunction>
): ExpressionValue {
  if (node.op === '&&') {
    const leftVal = evaluateNode(node.left, context, functions);
    if (!toBool(leftVal)) {
      return false;
    }
    return toBool(evaluateNode(node.right, context, functions));
  }

  if (node.op === '||') {
    const leftVal = evaluateNode(node.left, context, functions);
    if (toBool(leftVal)) {
      return true;
    }
    return toBool(evaluateNode(node.right, context, functions));
  }

  const left = evaluateNode(node.left, context, functions);
  const right = evaluateNode(node.right, context, functions);

  if (['+', '-', '*', '/', '%', '^'].includes(node.op)) {
    return evaluateArithmeticOp(node.op, left, right);
  }

  return evaluateComparisonOp(node.op, left, right);
}

function evaluateCall(
  node: Extract<ASTNode, { type: 'Call' }>,
  context: EvaluationContext | undefined,
  functions: Record<string, CustomFunction>
): ExpressionValue {
  const calleeLower = node.callee.toLowerCase();
  const fn = functions[node.callee] || functions[calleeLower] || SAFE_MATH_FUNCTIONS[calleeLower];

  if (!fn) {
    throw new Error(`Unknown function: ${node.callee}`);
  }

  const evaluatedArgs = node.args.map(arg => evaluateNode(arg, context, functions));
  return fn(...evaluatedArgs);
}

function evaluateNode(
  node: ASTNode,
  context: EvaluationContext | undefined,
  functions: Record<string, CustomFunction>
): ExpressionValue {
  switch (node.type) {
    case 'Literal':
      return node.value;

    case 'Identifier': {
      if (context && Object.hasOwn(context, node.name)) {
        return context[node.name] as ExpressionValue;
      }
      return undefined;
    }

    case 'UnaryOp': {
      const argVal = evaluateNode(node.argument, context, functions);
      if (node.op === '-') {
        return -toNum(argVal);
      }
      return !toBool(argVal);
    }

    case 'BinaryOp':
      return evaluateBinaryOp(node, context, functions);

    case 'Call':
      return evaluateCall(node, context, functions);
  }
}

export class GoalExpressionParser {
  public functions: Record<string, CustomFunction> = {};

  public parse(expression: string): ParsedExpression {
    const tokens = tokenize(expression);
    const parser = new TokenParser(tokens);
    const ast = parser.parse();

    return {
      evaluate: (context?: EvaluationContext) => {
        return evaluateNode(ast, context, this.functions);
      }
    };
  }

  public evaluate(expression: string, context?: EvaluationContext): ExpressionValue {
    return this.parse(expression).evaluate(context);
  }
}
