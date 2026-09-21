import type { Task } from "@jev/contracts";

export function TaskResult({ task }: { task: Task }) {
  const progress = [...task.events].reverse().find(event => event.type !== "provider")?.summary;
  return (
    <section className="task-conversation" aria-label="Request and response">
      <div className="user-message">
        <span>You</span>
        <p>{task.goal}</p>
      </div>

      <div className="assistant-message">
        <span className="assistant-label">JEV</span>
        <div role="status" aria-live="polite">
          {task.state === "running" && (
            <p className="working-message">
              <span className="working-dot" />
              {progress || "Working…"}
            </p>
          )}
          {task.error && <p className="task-error">{task.error}</p>}
          {task.result && <p className="response-text">{task.result}</p>}
          {task.state === "cancelled" && <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "8px 0" }}>Stopped. Send another request whenever you're ready.</p>}
          {task.state === "paused" && <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "8px 0" }}>Paused.</p>}
        </div>

        {task.evidence && (task.result || task.error) && (
          <div className="source-results">
            {task.evidence.stories.length > 0 && (
              <ol className="story-list">
                {task.evidence.stories.map((story, index) => (
                  <li key={`${index}-${story.url}`}>
                    <a href={story.url} target="_blank" rel="noopener noreferrer">
                      {story.title}<span aria-hidden="true"> ↗</span>
                    </a>
                    <small>{new URL(story.url).hostname}</small>
                  </li>
                ))}
              </ol>
            )}
            <a className="source-link" href={task.evidence.url} target="_blank" rel="noopener noreferrer">
              Source: {task.evidence.title} ↗
            </a>
            <details className="evidence-details">
              <summary>Page text</summary>
              <pre>{task.evidence.text}</pre>
            </details>
          </div>
        )}
      </div>

      {task.events.length > 0 && (
        <details className="activity-details">
          <summary>{task.stepsCompleted} browser step{task.stepsCompleted !== 1 ? "s" : ""}</summary>
          <ol>
            {task.events.map(event => (
              <li key={event.id}>
                <span>{event.summary}</span>
                <small>{event.tool}</small>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
