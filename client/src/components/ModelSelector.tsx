
import { useEffect, useState } from "react";

type ModelsResponse = {
  models: string[];
  defaultModel: string;
};

type ModelSelectorProps = {
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled?: boolean;
};

function ModelSelector({
  selectedModel,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadModels() {
      try {
        const response = await fetch("http://localhost:3000/models");

        if (!response.ok) {
          throw new Error("Failed to load models");
        }

        const data: ModelsResponse = await response.json();

        if (!Array.isArray(data.models) || data.models.length === 0) {
          throw new Error("No models are configured");
        }

        if (!isActive) return;

        setModels(data.models);
        setError("");

        onModelChange(
          data.models.includes(selectedModel)
            ? selectedModel
            : data.defaultModel
        );
      } catch (err) {
        if (!isActive) return;

        setError(
          err instanceof Error ? err.message : "Failed to load models"
        );
      }
    }

    loadModels();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="model-selector">
      <label className="sr-only" htmlFor="model-select">
        Select AI model
      </label>

      <select
        id="model-select"
        value={selectedModel}
        onChange={(event) => onModelChange(event.target.value)}
        disabled={disabled || models.length === 0}
        aria-label="Select AI model"
        title={error || "Choose which AI model to use"}
      >
        {models.length === 0 && (
          <option value="">
            {error ? "Models unavailable" : "Loading models…"}
          </option>
        )}

        {models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </div>
  );
}

export default ModelSelector;
