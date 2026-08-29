import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";
import { shadowBidEvmGrammar } from "./shadowbid-primitive.ts";

export const grammar = {
  "transfer-assets": builtinGrammars.evmErc721,
  "midnightContractState": builtinGrammars.midnightGeneric,
  "shadowBidEvm": shadowBidEvmGrammar,
  "shadowBidMidnight": shadowBidEvmGrammar,
} as const satisfies GrammarDefinition;
