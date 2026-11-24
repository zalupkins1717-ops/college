export default function ReferencePage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">СПРАВОЧНИК</p>
          <h1>Формулы и обозначения</h1>
          <p className="page-description">
            Всё, что стоит за расчётами: от абсолютной погрешности до допустимого
            интервала результата.
          </p>
        </div>
      </header>

      <div className="reference-grid">
        <section className="reference-section">
          <p className="eyebrow">01 / ОСНОВЫ</p>
          <h2 className="section-heading">Фактическая погрешность</h2>
          <p>
            Если известны точное значение x и его приближение x̃, абсолютная
            погрешность показывает, насколько они отличаются.
          </p>
          <div className="formula-block">Δ = |x − x̃|</div>
          <div className="formula-block">δ = Δ / |x| · 100%</div>
          <p className="muted">
            При x = 0 относительная погрешность не определена. Абсолютную
            погрешность при этом вычислить можно.
          </p>
        </section>

        <section className="reference-section">
          <p className="eyebrow">02 / ОБОЗНАЧЕНИЯ</p>
          <h2 className="section-heading">Значение и граница ошибки</h2>
          <p>
            a и b — приближённые исходные значения; εa и εb — неотрицательные
            границы их абсолютных погрешностей. Результат z с границей ε лежит
            в интервале [z − ε; z + ε].
          </p>
          <div className="formula-block">r = ε / |z| · 100%</div>
          <p className="muted">
            В калькуляторах граница относительной погрешности выражается через
            приближённый результат z. При z = 0 она не определена. Фактическая
            погрешность и её гарантированная граница — разные величины.
          </p>
        </section>

        <section className="reference-section">
          <p className="eyebrow">03 / СЛОЖЕНИЕ И ВЫЧИТАНИЕ</p>
          <h2 className="section-heading">Границы складываются</h2>
          <div className="formula-block">z = a ± b; ε = εa + εb</div>
          <p>
            При вычитании близких чисел результат может оказаться очень малым,
            а абсолютная граница останется прежней. Поэтому относительная
            погрешность резко возрастает.
          </p>
          <p className="reference-note">
            Например: 10 − 9,8 = 0,2. При εa = εb = 0,1 граница ε = 0,2,
            а r = 100%. Возможный результат лежит в интервале [0; 0,4].
          </p>
        </section>

        <section className="reference-section">
          <p className="eyebrow">04 / УМНОЖЕНИЕ И ПЛОЩАДЬ</p>
          <h2 className="section-heading">Учитываем обе погрешности</h2>
          <div className="formula-block">z = a · b</div>
          <div className="formula-block">ε = |a| · εb + |b| · εa + εa · εb</div>
          <p>
            Площадь прямоугольника S = a · b рассчитывается по той же формуле.
            Для положительных сторон, когда a ≥ εa и b ≥ εb, точные границы
            площади равны:
          </p>
          <div className="formula-block">Smin = (a − εa) · (b − εb)</div>
          <div className="formula-block">Smax = (a + εa) · (b + εb)</div>
          <p className="muted">
            Допуск ±t% выполнен, если весь интервал [Smin; Smax] находится
            внутри [S · (1 − t/100); S · (1 + t/100)].
          </p>
        </section>

        <section className="reference-section">
          <p className="eyebrow">05 / ДЕЛЕНИЕ</p>
          <h2 className="section-heading">Знаменатель не содержит ноль</h2>
          <div className="formula-block">z = a / b; |b| &gt; εb</div>
          <div className="formula-block">ε = (εa + |z| · εb) / (|b| − εb)</div>
          <p>
            Если |b| ≤ εb, допустимый интервал знаменателя содержит ноль.
            В этом случае конечную границу погрешности частного получить
            нельзя, и калькулятор попросит изменить исходные значения.
          </p>
        </section>

        <section className="reference-section">
          <p className="eyebrow">06 / ОКРУГЛЕНИЕ</p>
          <h2 className="section-heading">Сколько знаков оставить</h2>
          <p>
            При сохранении n знаков после запятой шаг представления составляет
            h = 10⁻ⁿ. Фактическая ошибка равна модулю разности исходного и
            полученного значений.
          </p>
          <div className="formula-block">Округление: Δ ≤ 0,5 · 10⁻ⁿ</div>
          <div className="formula-block">Усечение к нулю: Δ &lt; 10⁻ⁿ</div>
          <p className="muted">
            Например, 17,3862 до двух знаков: округление даёт 17,39
            с ошибкой 0,0038, усечение — 17,38 с ошибкой 0,0062.
          </p>
        </section>
        <section className="reference-section">
          <h2 className="section-heading">Численное дифференцирование</h2>
          <div className="formula-block">f′(x) ≈ [f(x + h) − f(x − h)] / (2h)</div>
          <p>Для частной производной меняется только выбранная координата. Например, для f(x, y) = x²y в точке (2, 3) получим ∂f/∂x ≈ 12 и ∂f/∂y ≈ 4.</p>
          <p className="muted">Шаг h должен быть положительным. Слишком маленький шаг усиливает ошибки округления. Углы в тригонометрических функциях задаются в радианах.</p>
        </section>
      </div>
    </>
  );
}
