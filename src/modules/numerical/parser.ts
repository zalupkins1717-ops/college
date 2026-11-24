export type Axis = 'x' | 'y' | 'z';
export type Coordinates = Record<Axis, number>;
type Expression = (point: Coordinates) => number;
type Token = { kind: 'number' | 'name' | 'operator' | 'end'; value: string };

const functions = new Map<string, (x: number) => number>([
  ['sin', Math.sin], ['cos', Math.cos],
  ['tan', x => Math.abs(Math.cos(x)) <= 2 * Number.EPSILON ? NaN : Math.tan(x)],
  ['asin', Math.asin], ['acos', Math.acos], ['atan', Math.atan],
  ['sqrt', Math.sqrt], ['cbrt', Math.cbrt], ['abs', Math.abs], ['exp', Math.exp],
  ['ln', Math.log], ['log', Math.log10], ['log10', Math.log10],
]);

function finite(value: number): number {
  return Number.isFinite(value) ? value : NaN;
}

function tokenize(raw: string): Token[] {
  if (raw.length > 512) throw new Error('Сократите формулу до 512 символов.');
  const source = raw.toLowerCase().replaceAll('π', 'pi').replaceAll('−', '-')
    .replace(/[×·]/g, '*').replaceAll('÷', '/').replaceAll(',', '.').trim();
  if (!source) throw new Error('Введите формулу функции.');
  const lexer = /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z][a-z0-9]*|[()+\-*/^]/gy;
  const tokens: Token[] = [];
  while (lexer.lastIndex < source.length) {
    const offset = lexer.lastIndex;
    const match = lexer.exec(source);
    if (!match) throw new Error(`Недопустимый символ «${source[offset]}» в формуле.`);
    const value = match[0];
    if (value.trim()) {
      const kind = /^[a-z]/.test(value) ? 'name' : /^[\d.]/.test(value) ? 'number' : 'operator';
      tokens.push({ kind, value });
    }
  }
  tokens.push({ kind: 'end', value: '' });
  return tokens;
}

/** Parse only mathematical expressions. The result can be reused at every sample point. */
export function compileExpression(raw: string, axes: readonly Axis[]): Expression {
  const tokens = tokenize(raw);
  let index = 0;
  const current = () => tokens[index];
  function take(value: string): boolean {
    if (current().value !== value) return false;
    index++;
    return true;
  }

  function primary(): Expression {
    const token = current();
    if (take('(')) {
      const inside = sum();
      if (!take(')')) throw new Error('Закройте скобку в формуле.');
      return inside;
    }
    if (token.kind === 'number') {
      index++;
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new Error('Число в формуле слишком велико.');
      return () => value;
    }
    if (token.kind !== 'name') throw new Error('В формуле ожидается число, переменная или выражение в скобках.');
    index++;
    const name = token.value;
    if (name === 'pi') return () => Math.PI;
    if (name === 'e') return () => Math.E;
    if (name === 'x' || name === 'y' || name === 'z') {
      if (!axes.includes(name)) throw new Error(`Переменная ${name} недоступна. Разрешены: ${axes.join(', ')}.`);
      return point => point[name];
    }
    const fn = functions.get(name);
    if (!fn) throw new Error(`Неизвестное имя «${name}» в формуле.`);
    if (!take('(')) throw new Error(`Аргумент ${name} нужно заключить в скобки.`);
    const argument = sum();
    if (!take(')')) throw new Error(`Закройте скобку функции ${name}.`);
    return point => {
      const value = argument(point);
      return Number.isFinite(value) ? finite(fn(value)) : NaN;
    };
  }

  function power(): Expression {
    const base = primary();
    if (!take('^')) return base;
    const exponent = unary();
    return point => {
      const a = base(point), b = exponent(point);
      return Number.isFinite(a) && Number.isFinite(b) ? finite(a ** b) : NaN;
    };
  }
  function unary(): Expression {
    if (take('+')) return unary();
    if (take('-')) {
      const operand = unary();
      return point => -operand(point);
    }
    return power();
  }
  function product(): Expression {
    let expression = unary();
    while (true) {
      const next = current();
      const divide = take('/');
      if (!divide && !take('*') && next.kind !== 'name' && next.value !== '(') return expression;
      const left = expression, right = unary();
      expression = divide
        ? point => finite(left(point) / right(point))
        : point => finite(left(point) * right(point));
    }
  }
  function sum(): Expression {
    let expression = product();
    while (current().value === '+' || current().value === '-') {
      const subtract = tokens[index++].value === '-';
      const left = expression, right = product();
      expression = subtract
        ? point => finite(left(point) - right(point))
        : point => finite(left(point) + right(point));
    }
    return expression;
  }
  const result = sum();
  if (current().kind !== 'end') throw new Error(`Проверьте знак или скобки около «${current().value}».`);
  return result;
}
