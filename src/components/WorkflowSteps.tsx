import { AppIcon } from "./AppIcon";

export function WorkflowSteps({ steps, current, onStep, disabled = false }: { steps: string[]; current: number; onStep?: (index: number) => void; disabled?: boolean }) {
  return <ol className="workflow-steps" aria-label="Your progress">
    {steps.map((step, index) => <li key={step} aria-current={index === current ? "step" : undefined} className={index <= current ? "is-active" : ""}>
      <button type="button" onClick={() => onStep?.(index)} disabled={disabled || !onStep || index >= current} aria-label={`${step}${index < current ? ", completed" : index === current ? ", current step" : ""}`}>
        <span className="workflow-number">{index < current ? <AppIcon name="check" className="size-4" /> : index + 1}</span>
        <span>{step}</span>
      </button>
    </li>)}
  </ol>;
}
