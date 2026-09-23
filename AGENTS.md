# AGENTS.md — gstack Engineering & Product Standards

This project follows the core engineering ethos and principles from [gstack](https://github.com/garrytan/gstack) by Garry Tan (President & CEO of Y Combinator).

## Core Ethos

- **Boil the Ocean**: AI makes completeness inexpensive, so build the complete thing: exhaustive tests, edge cases, error paths, and graceful failure modes. Shortcuts and deferred items require an explicit, recorded decision.
- **Search Before Building**: Know what exists before writing new code. Don't reinvent the wheel (layer 1: tried-and-true); scrutinize the trendy (layer 2); prize first-principles insight (layer 3) above all.
- **User Sovereignty**: Models recommend; the human decides. Cross-model agreement is helpful advice, never automatic permission. Never change the user's stated direction without checking first.
- **Build for Yourself**: The specificity of a real, visceral problem beats the generality of a hypothetical one.

## The Reuse Ladder

Before writing new code or pulling in libraries, stop at the first rung that holds:
1. **Existing Repo Patterns**: A helper, util, or pattern already in this repository. (Re-implementing what is already a few files over is the most common AI failure mode).
2. **Standard Library**: Clean native language APIs and built-ins.
3. **Native Platform Features**: CSS over JavaScript, database constraints over application validation, native HTML elements over custom component trees.
4. **Already-Installed Dependencies**: Never add a new npm/pip package for what a few lines of code can accomplish.

Then build the complete version of what remains. **Bug fixes must hit root cause, not symptom**: one guard in the shared function beats a guard in every caller.

## Voice & Communication

- **Direct, concrete, builder-to-builder**: Name the exact file, function, command, line number, and user-visible outcome.
- **Lead with the point**: Say what it does, why it matters, and what changes for the user.
- **No AI fluff or corporate padding**: Avoid throat-clearing, buzzwords, generic optimism, and AI tropes (*delve, crucial, robust, comprehensive, tapestry, landscape, pivotal*).
- **Tie technical choices to user outcomes**: What does the real user see, lose, wait for, or unlock?
