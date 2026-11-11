// ---------- вспомогательное ----------

function fmt(x: number, n: number): string {
  const p = 10 ** n;
  const s = String(Math.round(x * p) / p);
  if (n === 0) return s;
  const [i, f = ""] = s.split(".");
  return i + "." + (f + "0".repeat(n)).slice(0, n);
}

// ---------- функции ----------

function actualErrors(exact: number, approx: number): [number, number | null] {
  const d = Math.abs(exact - approx);
  return exact === 0 ? [d, null] : [d, (d / Math.abs(exact)) * 100];
}

function check(ea: number, eb: number): void {
  if (ea < 0 || eb < 0) throw new Error("Границы < 0");
}

function add(a: number, b: number, ea: number, eb: number): [number, number] {
  check(ea, eb);
  return [a + b, ea + eb];
}

function sub(a: number, b: number, ea: number, eb: number): [number, number] {
  check(ea, eb);
  return [a - b, ea + eb];
}

function mul(a: number, b: number, ea: number, eb: number): [number, number] {
  check(ea, eb);
  return [a * b, Math.abs(a) * eb + Math.abs(b) * ea + ea * eb];
}

function div(a: number, b: number, ea: number, eb: number): [number, number] {
  check(ea, eb);
  if (Math.abs(b) <= eb) throw new Error("В знаменателе может быть 0");
  const z = a / b;
  return [z, (ea + Math.abs(z) * eb) / (Math.abs(b) - eb)];
}

function rel(z: number, e: number): number | null {
  return z === 0 ? null : (e / Math.abs(z)) * 100;
}

// ---------- Задание 1 ----------
console.log("Задание 1");
for (const [x, xp] of [[25, 24.8], [10, 10.8]] as [number, number][]) {
  const [d, r] = actualErrors(x, xp);
  const rs = r === null ? "не определена" : fmt(r, 2) + "%";
  console.log(`x=${x} прибл=${xp}: Δ=${fmt(d, 4)}, δ=${rs}`);
}

// ---------- Задание 2 ----------
console.log("\nЗадание 2");
const x = 17.3862;
const okr = Math.round(x * 100) / 100;
const usek = Math.trunc(x * 100) / 100;
console.log(`Округление: ${fmt(okr, 2)}, погрешность ${fmt(Math.abs(x - okr), 4)} (граница 0.005)`);
console.log(`Усечение:   ${fmt(usek, 2)}, погрешность ${fmt(Math.abs(x - usek), 4)} (граница 0.01)`);

// ---------- Задание 3 ----------
console.log("\nЗадание 3");
const a = 12, b = 4, ea = 0.1, eb = 0.1;

for (const [name, f] of [
  ["+", add],
  ["-", sub],
  ["*", mul],
] as [string, typeof add][]) {
  const [z, e] = f(a, b, ea, eb);
  const r = rel(z, e)!;
  console.log(`${name}: z=${fmt(z, 2)}, ε=${fmt(e, 4)}, r=${fmt(r, 2)}%`);
}
{
  const [z, eRaw] = div(a, b, ea, eb);
  const e = Math.ceil(eRaw * 1000) / 1000;
  const r = rel(z, e)!;
  console.log(`/: z=${fmt(z, 2)}, ε=${fmt(e, 3)}, r=${fmt(r, 2)}%`);
}

// ---------- Задание 4 ----------
console.log("\nЗадание 4");
const [S, eS] = mul(20, 10, 0.1, 0.1);
const Smin = 19.9 * 9.9;
const Smax = 20.1 * 10.1;
const rS = rel(S, eS)!;
console.log(`S = ${fmt(S, 2)} см², εS = ${fmt(eS, 2)} см², r = ${fmt(rS, 2)}%`);
console.log(`[Smin; Smax] = [${fmt(Smin, 2)}; ${fmt(Smax, 2)}]`);
console.log(`[0.98S; 1.02S] = [${fmt(0.98 * S, 2)}; ${fmt(1.02 * S, 2)}]`);
console.log("Условие ±2%:", Smin >= 0.98 * S && Smax <= 1.02 * S);

// ---------- Задание 5 ----------
console.log("\nЗадание 5");
for (const [b5, eb5] of [[2, 0.1], [9, 0.1], [9.8, 0.1]] as [number, number][]) {
  const [z, e] = sub(10, b5, 0.1, eb5);
  const r = rel(z, e)!;
  console.log(
    `b=${b5}: z=${fmt(z, 2)}, ε=${fmt(e, 4)}, r=${fmt(r, 2)}%, [${fmt(z - e, 2)}; ${fmt(z + e, 2)}]`
  );
}

// ---------- Проверки ----------
console.log("\nПроверки");
{
  const [, e81] = mul(6, 2, 0.1, 0.1);
  console.log("6*2 ε =", fmt(e81, 2), "| ок:", Math.abs(e81 - 0.81) < 1e-12);
}
const checks: [string, (...args: number[]) => [number, number], number[]][] = [
  ["деление на 0", div, [5, 0, 0.1, 0.1]],
  ["b=εb", div, [1, 0.1, 0.1, 0.1]],
  ["отрицательная ε", mul, [1, 2, -0.1, 0.1]],
];
for (const [name, fn, args] of checks) {
  try {
    fn(...args);
    console.log(name, "— НЕ поймали ошибку!");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(name, "—", msg);
  }
}
