import { useState } from 'react';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { AppShell, DemoModeNote } from './components/AppShell';
import { Card, LoadingState } from './components/ui';
import { matchChatRoute, matchIdRoute, matchStepRoute, useHashRoute } from './lib/router';
import type { ViewState } from './lib/useMockData';
import { DataModeProvider, useDataMode } from './lib/dataMode';
import { goals, accessRequests } from './fixtures/all-states';
import { OnboardingPage } from './pages/OnboardingPage';
import { StepPage } from './pages/StepPage';
import { RequestsPage } from './pages/RequestsPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { BuddyEscalationDetailPage, BuddyEscalationsPage } from './pages/BuddyPages';
import { KnowledgeGapDetailPage, KnowledgeGapsPage } from './pages/KnowledgeGapsPages';
import { ChatPage } from './pages/ChatPage';
import { LiveOnboardingPage } from './pages/LiveOnboardingPage';
import { LiveStepPage } from './pages/LiveStepPage';
import { LiveApprovalsPage, LiveRequestsPage } from './pages/LiveAccessPages';
import { LiveBuddyEscalationDetailPage, LiveBuddyEscalationsPage } from './pages/LiveBuddyPages';
import { LiveKnowledgeGapDetailPage, LiveKnowledgeGapsPage } from './pages/LiveKnowledgeGapsPages';
import { LiveChatPage } from './pages/LiveChatPage';
import { GrantStateBadge, RequestStatusBadge } from './components/StatusBadge';
import { href } from './lib/router';

function ContextSidebar() {
  const goal = goals[0];
  const request = accessRequests[0];
  return (
    <>
      <Card>
        <h3 className="mb-2 text-sm font-semibold">Прогресс цели</h3>
        <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={goal.progress.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${goal.progress.percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          {goal.progress.verified} из {goal.progress.total} шагов проверено
        </p>
        <a href={href('/onboarding')} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
          Смотреть маршрут →
        </a>
      </Card>
      <Card>
        <h3 className="mb-2 text-sm font-semibold">Активная заявка</h3>
        <p className="text-sm">{request.resource_id}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <RequestStatusBadge status={request.status} />
          <GrantStateBadge state={request.grant_state} />
        </div>
        <a href={href('/requests')} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
          Все заявки →
        </a>
      </Card>
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <LifeBuoy size={16} className="text-primary" aria-hidden /> Наставник
        </h3>
        <p className="text-xs text-text-secondary">
          Если ответ не найден, AI подготовит диагностику — вы подтверждаете отправку, buddy отвечает.
        </p>
      </Card>
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} className="text-primary" aria-hidden /> Доверие
        </h3>
        <p className="text-xs text-text-secondary">
          «Проверено» ставит только mock-проверка. Отметки, заявки и ответы наставника — не evidence.
        </p>
      </Card>
    </>
  );
}

export function App() {
  return (
    <DataModeProvider>
      <AppInner />
    </DataModeProvider>
  );
}

function AppInner() {
  const route = useHashRoute();
  const { mode, ready, setMode, user, accountId, switchAccount, sessionError } = useDataMode();
  const [view, setView] = useState<ViewState>('data');

  const stepRoute = matchStepRoute(route);
  const chatContext = matchChatRoute(route);
  const escalationId = matchIdRoute(route, '/buddy/escalations');
  const gapId = matchIdRoute(route, '/knowledge-gaps');

  let page: React.ReactNode;
  let sidebar: React.ReactNode = null;

  if (!ready) {
    page = <Card><LoadingState /></Card>;
  } else if (mode === 'live') {
    if (stepRoute) {
      page = <LiveStepPage goalId={stepRoute.goalId} stepId={stepRoute.stepId} />;
    } else if (route === '/onboarding') {
      page = <LiveOnboardingPage />;
    } else if (route === '/requests') {
      page = <LiveRequestsPage />;
    } else if (route === '/approvals') {
      page = <LiveApprovalsPage />;
    } else if (escalationId) {
      page = <LiveBuddyEscalationDetailPage id={escalationId} />;
    } else if (route === '/buddy/escalations') {
      page = <LiveBuddyEscalationsPage />;
    } else if (gapId) {
      page = <LiveKnowledgeGapDetailPage id={gapId} />;
    } else if (route === '/knowledge-gaps') {
      page = <LiveKnowledgeGapsPage />;
    } else {
      page = <LiveChatPage goalId={chatContext?.goalId ?? null} stepId={chatContext?.stepId ?? null} />;
    }
  } else if (stepRoute) {
    page = <StepPage goalId={stepRoute.goalId} stepId={stepRoute.stepId} view={view} />;
    sidebar = <ContextSidebar />;
  } else if (route === '/onboarding') {
    page = <OnboardingPage view={view} />;
    sidebar = <ContextSidebar />;
  } else if (route === '/requests') {
    page = <RequestsPage view={view} />;
  } else if (route === '/approvals') {
    page = <ApprovalsPage view={view} />;
  } else if (escalationId) {
    page = <BuddyEscalationDetailPage id={escalationId} view={view} />;
  } else if (route === '/buddy/escalations') {
    page = <BuddyEscalationsPage view={view} />;
  } else if (gapId) {
    page = <KnowledgeGapDetailPage id={gapId} view={view} />;
  } else if (route === '/knowledge-gaps') {
    page = <KnowledgeGapsPage view={view} />;
  } else {
    page = <ChatPage view={view} />;
  }

  return (
    <AppShell
      user={user}
      route={route}
      view={view}
      onUserChange={(id) => void switchAccount(id)}
      onViewChange={setView}
      mode={mode}
      onModeChange={setMode}
      sidebar={sidebar}
    >
      {ready && mode === 'fixtures' && <DemoModeNote />}
      {sessionError && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-error" role="alert">{sessionError}</p>
      )}
      <div key={`${mode}-${accountId}`}>{page}</div>
    </AppShell>
  );
}
