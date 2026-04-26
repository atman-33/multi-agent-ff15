import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REVIEW_CYCLE_TEST_OPERATION_NAME = "test-review-cycle-flow";
export const REVIEW_CYCLE_TEST_OPERATION_FILE_NAME = `${REVIEW_CYCLE_TEST_OPERATION_NAME}.yaml`;
export const REVIEW_CYCLE_TEST_OPERATION_REF = `builtin:ja:${REVIEW_CYCLE_TEST_OPERATION_FILE_NAME}`;

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), "operations");
const reviewCycleFixturePath = join(fixtureDirectory, REVIEW_CYCLE_TEST_OPERATION_FILE_NAME);

export function writeReviewCycleTestOperation(root: string, language = "ja"): string {
  const operationsDirectory = join(root, "builtins", language, "operations");
  const operationPath = join(operationsDirectory, REVIEW_CYCLE_TEST_OPERATION_FILE_NAME);

  mkdirSync(operationsDirectory, { recursive: true });
  copyFileSync(reviewCycleFixturePath, operationPath);

  return operationPath;
}