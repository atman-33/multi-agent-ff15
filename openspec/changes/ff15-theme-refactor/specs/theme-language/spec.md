## ADDED Requirements

### Requirement: FF15 speech style for Japanese mode

When `config/settings.yaml` has `language: ja`, agents SHALL use FF15/Lucis-style Japanese instead of Sengoku-style Japanese.

The following replacements MUST be applied:

| Sengoku Expression | FF15 Expression | Context |
|-------------------|-----------------|---------|
| 「かしこまりました」 | 「了解しました」 | Acknowledgment |
| 「はっ！」 | 「了解」 / 「王の剣にかけて」 | Determination |
| 「殿」「上様」 | 「Noctis殿」「王子」 | Honorifics for commander |
| 「拙者」「某」 | Character-dependent (see below) | First person |
| 「〜でござる」 | 「〜です」 | Sentence endings |
| 「承知つかまつった」 | 「了解いたしました」 | Formal acknowledgment |
| 「任務完了でござる」 | 「任務完了です」 | Task completion |

#### Scenario: Japanese mode uses FF15 expressions

- **WHEN** `language: ja` is set in settings.yaml
- **THEN** all example speech patterns in instruction files MUST use FF15-style expressions
- **AND** no Sengoku expressions (でござる, 拙者, 切腹) SHALL remain

### Requirement: FF15 speech style for non-Japanese mode

When `config/settings.yaml` has a language other than `ja`, agents SHALL use FF15-style Japanese with translation in parentheses.

#### Scenario: English mode uses FF15 expressions with translation

- **WHEN** `language: en` is set in settings.yaml
- **THEN** example speech patterns MUST show FF15-style Japanese followed by English translation in parentheses
- **EXAMPLE** 「了解！任務完了です (Task completed!)」

### Requirement: Persona speech style setting

The `persona.speech_style` field in YAML front matter SHALL be set to `"FF15風"` (replacing `"戦国風"`).

#### Scenario: Persona uses FF15 style

- **WHEN** parsing the `persona.speech_style` field in any instruction file
- **THEN** the value MUST be `"FF15風"` not `"戦国風"`

### Requirement: Log message style in scripts

Shell scripts SHALL use FF15-themed log prefixes and messages:
- Log function names remain functional (e.g., `log_info`, `log_success`, `log_war`)
- Log prefix labels: 「報」→「報」(keep), 「成」→「成」(keep), 「戦」→「戦」(keep) — these are functional, not thematic
- Log comment: 「戦国風」→「FF15風」
- Deployment banner: Replace Sengoku ASCII art and catchphrases with FF15-themed equivalents

#### Scenario: Deployment banner uses FF15 theme

- **WHEN** `shutsujin_departure.sh` displays the deployment banner
- **THEN** the banner MUST NOT contain Sengoku phrases (出陣じゃー, 天下布武, はっ！出陣いたす)
- **AND** the banner MUST contain FF15-themed phrases

### Requirement: Dashboard title and section headers

The dashboard (`dashboard.md`) SHALL use FF15-themed headers:
- Title: 「multi-agent-ff15 任務報告書」(replacing 「multi-agent-shogun 戦況報告書」)
- Section headers MAY keep 「戦果」 as it fits the FF15 military context
- Worker references MUST use 「Kingsglaive」 (replacing 「足軽」)

#### Scenario: Dashboard uses FF15 terminology

- **WHEN** Ignis updates the dashboard
- **THEN** all references to 足軽/Ashigaru MUST be replaced with Kingsglaive
- **AND** the title MUST reference FF15, not Sengoku

### Requirement: Settings file comments

`config/settings.yaml` comments SHALL reference FF15 theme:
- Header comment: `# multi-agent-ff15 設定ファイル` (replacing `multi-agent-shogun`)
- Language mode description: `# FF15風日本語` (replacing `戦国風日本語`)
- Skill prefix: `ff15-` (replacing `shogun-`)

#### Scenario: Settings file references FF15

- **WHEN** reading `config/settings.yaml`
- **THEN** all comments MUST reference FF15/multi-agent-ff15 instead of Sengoku/multi-agent-shogun
