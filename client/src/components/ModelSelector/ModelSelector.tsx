
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { Search, ChevronDown, Check } from "lucide-react";
import "./modelSelector.scss";

type ConfiguredModel = {
  id: string;
  provider: string;
  model: string;
};

type ModelsResponse = {
  models: ConfiguredModel[];
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
  const [models, setModels] = useState<ConfiguredModel[]>([]);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

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
          data.models.some((model) => model.id === selectedModel)
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

  const selectedModelData = models.find(
    (model) => model.id === selectedModel
  );

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const source = model.provider === "ollama" ? "local" : "cloud";

      const matchesFilter =
        filter === "all" || source === filter;

      const searchText =
        `${model.model} ${model.provider} ${model.id}`.toLowerCase();

      const matchesSearch = searchText.includes(search.toLowerCase());

      return matchesFilter && matchesSearch;
    });
  }, [models, filter, search]);

  function selectModel(modelId: string) {
    onModelChange(modelId);
    setOpened(false);
    setSearch("");
  }

  return (
    <div >
      <Button
        variant="subtle"
        disabled={disabled || models.length === 0}
        onClick={() => setOpened(true)}
        rightSection={<ChevronDown size={16} />}
        className="model-selector-trigger"
      >
        <span>
          {selectedModelData?.model ??
            (error ? "Models unavailable" : "Loading models…")}
        </span>
      </Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Select AI model"
        centered
        size="lg"
        overlayProps={{ backgroundOpacity: 0.65, blur: 3 }}
      >
        <Stack gap="md">
          <TextInput
            placeholder="Search models or providers..."
            leftSection={<Search size={16} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />

          <SegmentedControl
            fullWidth
            value={filter}
            onChange={setFilter}
            data={[
              { label: "All", value: "all" },
              { label: "Local", value: "local" },
              { label: "Cloud", value: "cloud" },
            ]}
          />

          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}

          <ScrollArea h={320} offsetScrollbars>
            <Stack gap="xs">
              {filteredModels.map((model) => {
                const isLocal = model.provider === "ollama";
                const isSelected = model.id === selectedModel;

                return (
                  <Button
                    key={model.id}
                    variant={isSelected ? "light" : "subtle"}
                    color={isSelected ? "violet" : "gray"}
                    fullWidth
                    justify="space-between"
                    h="auto"
                    py="sm"
                    onClick={() => selectModel(model.id)}
                    className="model-selector-option"
                  >
                    <Group justify="space-between" wrap="nowrap" w="100%">
                      <Stack gap={4} align="flex-start">
                        <Text size="sm" fw={600}>
                          {model.model}
                        </Text>

                        <Group gap={6}>
                          <Badge size="xs" variant="light">
                            {model.provider}
                          </Badge>

                          <Badge
                            size="xs"
                            color={isLocal ? "teal" : "blue"}
                            variant="light"
                          >
                            {isLocal ? "Local" : "Cloud"}
                          </Badge>
                        </Group>
                      </Stack>

                      {isSelected && <Check size={18} />}
                    </Group>
                  </Button>
                );
              })}

              {filteredModels.length === 0 && (
                <Text c="dimmed" size="sm" ta="center" py="xl">
                  No models found
                </Text>
              )}
            </Stack>
          </ScrollArea>
        </Stack>
      </Modal>
    </div>
  );
}

export default ModelSelector;
