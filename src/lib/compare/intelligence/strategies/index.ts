import type { StrategyId } from "../types";
import { MixedComparisonStrategy } from "./mixed";
import { ModelComparisonStrategy } from "./model";
import type { ComparisonStrategy } from "./shared";
import { ToolComparisonStrategy } from "./tool";

export type { ComparisonStrategy, ExtractContext } from "./shared";

export const STRATEGIES: Record<StrategyId, ComparisonStrategy> = {
  tool: ToolComparisonStrategy,
  model: ModelComparisonStrategy,
  mixed: MixedComparisonStrategy,
};

export function strategyOf(id: StrategyId): ComparisonStrategy {
  return STRATEGIES[id];
}
