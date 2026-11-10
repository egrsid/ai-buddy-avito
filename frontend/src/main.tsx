import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Bootstrap screen only. Product routes and shared components are assigned to FE-01.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main>
      <p className="brand">Avito <span>AI-buddy</span></p>
      <section aria-labelledby="welcome">
        <h1 id="welcome">Рабочее пространство готовится</h1>
        <p>Здесь появятся план адаптации, AI-помощник и связь с наставником.</p>
      </section>
    </main>
  </StrictMode>,
);
