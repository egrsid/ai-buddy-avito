import { useEffect, useState } from 'react';

// Минимальный hash-router без новых зависимостей (заменяется при необходимости
// согласованным решением; lock-файл в RP-FE-01 не расширяем).

export function useHashRoute(): string {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || '/onboarding');
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || '/onboarding');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(to: string) {
  window.location.hash = to;
}

export function href(to: string) {
  return `#${to}`;
}

export function matchChatRoute(route: string): { goalId: string; stepId: string } | null {
  const m = route.match(/^\/chat\/([^/]+)\/([^/]+)$/);
  return m ? { goalId: m[1], stepId: m[2] } : null;
}

export function matchStepRoute(route: string): { goalId: string; stepId: string } | null {
  const m = route.match(/^\/onboarding\/([^/]+)\/steps\/([^/]+)$/);
  return m ? { goalId: m[1], stepId: m[2] } : null;
}

export function matchIdRoute(route: string, base: string): string | null {
  const m = route.match(new RegExp(`^${base}/([^/]+)$`));
  return m ? m[1] : null;
}
