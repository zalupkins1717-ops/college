import { useState } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronRight, History, Menu, X, Spline, Axis3D, ChartNoAxesCombined } from 'lucide-react';
import { calculators, getCalculator, isCalculatorId } from '../modules/calculators/model/catalog';
import CalculatorPage from '../modules/calculators/CalculatorPage';
import ReferencePage from '../modules/reference/ReferencePage';
import HistoryPage from '../modules/history/HistoryPage';
import { useHistory } from '../shared/hooks/useHistory';
import type { HistoryEntry } from '../shared/hooks/useHistory';
import NumericalPage from '../modules/numerical/NumericalPage';
import { isNumericalMode, numericalTitles } from '../modules/numerical/service';
import { Logo } from '../shared/ui/Logo';

export default function App() { return <HashRouter><AppShell /></HashRouter>; }

function AppShell() {
  const history = useHistory();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentId = location.pathname.split('/')[1];
  const title = isCalculatorId(currentId) ? getCalculator(currentId).shortTitle : isNumericalMode(currentId) ? numericalTitles[currentId] : currentId === 'history' ? 'История расчётов' : 'Формулы и обозначения';
  const isLibrary = currentId === 'history' || currentId === 'reference';
  const restore = (entry: HistoryEntry) => {
    if (isCalculatorId(entry.calculatorId) || isNumericalMode(entry.calculatorId)) navigate(`/${entry.calculatorId}`, { state: { restore: entry } });
  };
  return <div className="app-shell">
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Перейти к содержимому</a>
    {mobileOpen && <button className="sidebar-backdrop" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`} aria-label="Основное меню">
      <div className="sidebar-brand"><Link to="/area" onClick={() => setMobileOpen(false)} aria-label="Мера — главная"><Logo /></Link><button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню"><X size={21} /></button></div>
      <nav className="sidebar-navigation" onClick={() => setMobileOpen(false)}>
        <p className="nav-group-label">Калькуляторы</p>
        {calculators.map((calculator) => <NavLink key={calculator.id} to={`/${calculator.id}`} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><calculator.icon size={18} strokeWidth={1.8} /><span>{calculator.shortTitle}</span></NavLink>)}
        <p className="nav-group-label library-label">Численные методы</p>
        {([{ id: 'derivative', icon: Spline }, { id: 'partial', icon: Axis3D }, { id: 'plot', icon: ChartNoAxesCombined }] as const).map(({ id, icon: Icon }) => <NavLink key={id} to={`/${id}`} className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{numericalTitles[id]}</span></NavLink>)}
        <p className="nav-group-label library-label">Материалы</p>
        <NavLink to="/reference" className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><BookOpen size={18} strokeWidth={1.8} /><span>Справочник формул</span></NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'nav-active' : ''}`}><History size={18} strokeWidth={1.8} /><span>История расчётов</span>{history.entries.length > 0 && <span className="nav-count">{history.entries.length}</span>}</NavLink>
      </nav>
    </aside>

    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label="Открыть меню" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="breadcrumb-root">{isLibrary ? 'Материалы' : isNumericalMode(currentId) ? 'Численные методы' : 'Калькуляторы'}</span><ChevronRight size={13} /><span>{title}</span></div><div className="topbar-right"><Link to="/reference" className="topbar-help"><BookOpen size={18} /><span>Справочник</span></Link></div></header>
      <main id="main-content" className="main-content" tabIndex={-1}><Routes>
        <Route path="/" element={<Navigate to="/area" replace />} />
        <Route path="/reference" element={<ReferencePage />} />
        <Route path="/history" element={<HistoryPage loading={history.loading} entries={history.entries} onRemove={history.remove} onClear={history.clear} onRestore={restore} error={history.error} />} />
        {(['derivative', 'partial', 'plot'] as const).map(mode => <Route key={mode} path={'/' + mode} element={<NumericalPage key={mode} mode={mode} />} />)}
        <Route path="/:calculatorId" element={<CalculatorRoute />} />
        <Route path="*" element={<Navigate to="/area" replace />} />
      </Routes></main>
    </div>
  </div>;
}

function CalculatorRoute() {
  const { calculatorId = 'area' } = useParams();
  if (!isCalculatorId(calculatorId)) return <Navigate to="/area" replace />;
  return <CalculatorPage key={calculatorId} id={calculatorId} />;
}
