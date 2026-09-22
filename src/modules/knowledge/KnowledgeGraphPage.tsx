/**
 * KNOWLEDGE GRAPH — Spec Phase 03, §157 ("why?" engine).
 *
 * Selecting a topic answers three questions: what it needs, what needs it, and
 * what breaks downstream if it is wrong.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildProgress,
  dependents,
  prerequisiteChain,
  topicById,
  topicsByStage,
  TOPICS,
  type Topic,
} from '../../data/knowledge-graph';
import { GOLDEN_PRINCIPLES } from '../../data/sops';
import { FiveAnswers, PageHeader } from '../../components/ui';

export function KnowledgeGraphPage() {
  const [selectedId, setSelectedId] = useState<string>('gsd');
  const selected = topicById(selectedId);
  const progress = buildProgress();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Phase 03 — knowledge graph"
        title="The chain, as a dependency graph"
        lede="Every topic exists because something downstream fails without it. Select a topic to see what it requires, what requires it, and the golden principles it carries."
      />

      <div className="row small muted">
        <span className="badge built">{progress.built} built</span>
        <span className="badge partial">{progress.partial} partial</span>
        <span className="badge planned">{progress.planned} planned</span>
        <span>of {progress.total} mapped topics</span>
      </div>

      <div className="split">
        <div className="stack">
          {topicsByStage().map(({ stage, topics }) => (
            <div key={stage} className="panel">
              <p className="panel-title">{stage}</p>
              <div className="stack" style={{ display: 'grid', gap: 'var(--sp-1)' }}>
                {topics.map((topic) => (
                  <TopicButton
                    key={topic.id}
                    topic={topic}
                    active={topic.id === selectedId}
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {selected ? <TopicDetail topic={selected} onSelect={setSelectedId} /> : null}
      </div>
    </div>
  );
}

function TopicButton({
  topic,
  active,
  onSelect,
}: {
  topic: Topic;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      className="ghost"
      aria-pressed={active}
      onClick={() => onSelect(topic.id)}
      style={{ textAlign: 'left', width: '100%', display: 'flex', justifyContent: 'space-between', gap: 8 }}
    >
      <span>{topic.title}</span>
      <span className={`badge ${topic.status}`}>{topic.status}</span>
    </button>
  );
}

function TopicDetail({ topic, onSelect }: { topic: Topic; onSelect: (id: string) => void }) {
  const upstream = prerequisiteChain(topic.id);
  const downstream = dependents(topic.id);

  return (
    <div className="stack">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{topic.title}</h2>
          <span className={`badge ${topic.status}`}>{topic.status}</span>
        </div>
        <p className="muted" style={{ marginTop: 'var(--sp-2)' }}>
          {topic.summary}
        </p>
        <div className="row small">
          <span className="badge">{topic.stage}</span>
          <span className="badge">Spec phase {topic.phase}</span>
          {topic.route ? (
            <Link to={topic.route} className="small">
              Open the module →
            </Link>
          ) : (
            <span className="faint small">No module in this build yet.</span>
          )}
        </div>
      </div>

      {topic.five ? <FiveAnswers five={topic.five} /> : null}

      <div className="grid grid-2">
        <div className="panel">
          <p className="panel-title">Requires (upstream)</p>
          {upstream.length === 0 ? (
            <p className="small faint" style={{ margin: 0 }}>
              Foundation topic — nothing upstream.
            </p>
          ) : (
            <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {upstream.map((t) => (
                <li key={t.id}>
                  <button className="ghost" style={{ padding: 0, border: 0, background: 'none', color: 'var(--c-accent)' }} onClick={() => onSelect(t.id)}>
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <p className="panel-title">What breaks without it (downstream)</p>
          {downstream.length === 0 ? (
            <p className="small faint" style={{ margin: 0 }}>
              Terminal topic — nothing depends on it yet.
            </p>
          ) : (
            <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {downstream.map((t) => (
                <li key={t.id}>
                  <button className="ghost" style={{ padding: 0, border: 0, background: 'none', color: 'var(--c-accent)' }} onClick={() => onSelect(t.id)}>
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {topic.goldenPrinciples && topic.goldenPrinciples.length > 0 ? (
        <div className="panel">
          <p className="panel-title">Golden principles carried by this topic</p>
          <ol className="small" style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {topic.goldenPrinciples.map((n) => (
              <li key={n} value={n}>
                {GOLDEN_PRINCIPLES[n - 1]}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="xs faint">
        {TOPICS.length} topics mapped from the master specification. The full specification defines
        45 build phases; this graph records which of them exist in code.
      </p>
    </div>
  );
}
