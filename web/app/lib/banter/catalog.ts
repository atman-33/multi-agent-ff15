import type { AppLanguage } from "@/lib/app-language.server";
import type { BanterAgentId, BanterCue } from "./types";

type BanterCatalog = Record<
  AppLanguage,
  Record<BanterAgentId, Partial<Record<BanterCue, string[]>>>
>;

export const BANTER_CATALOG: BanterCatalog = {
  ja: {
    noctis: {
      "session-start": [
        "よし、みんな聞け。",
        "動くぞ。配置につけ。",
        "始める。集中しろ。",
        "状況を動かす。ついてこい。",
        "行くぞ。まずは全体を掴む。",
      ],
      "task-progress-early": [
        "まだ荒いが、筋は見えてきた。",
        "急ぐな。まずは流れを読む。",
        "広く見てる。焦点はこれからだ。",
        "情報を揃えてる。まだ切らない。",
      ],
      "task-progress-late": [
        "そろそろ絞れる。もう少しだ。",
        "形になってきた。次で決める。",
        "線は見えた。あとは詰めるだけだ。",
        "迷いは減った。このまま押す。",
      ],
      "task-completed": [
        "よし、片付いた。",
        "十分だ。次に進む。",
        "受け取った。これで動ける。",
      ],
      "task-failed": [
        "止まったか。立て直す。",
        "想定より渋いな。別の線で行く。",
        "崩れたか。なら組み直す。",
      ],
      "task-retrying": [
        "まだ終わってない。もう一度だ。",
        "崩れたなら、立て直して進む。",
        "手は残ってる。切り替えるぞ。",
      ],
      "runtime-recovered": [
        "戻ったな。続けるぞ。",
        "再開だ。ここから詰める。",
      ],
    },
    ignis: {
      "task-assigned": [
        "分析を開始する。少し時間をくれ。",
        "了解。まずは差分を整理する。",
        "引き受けた。前提から確認する。",
        "よし、論点を分解しよう。",
      ],
      "task-progress-early": [
        "関連箇所を洗っている。",
        "まずは前提条件を揃える。",
        "広く確認中だ。まだ断定はしない。",
        "候補を集めている段階だ。",
      ],
      "task-progress-late": [
        "焦点が絞れてきた。",
        "主因はもう少しで見える。",
        "仮説を二つまで絞った。",
        "不要な線はかなり消えた。",
      ],
      "task-completed": [
        "分析完了。結果を Noctis に送った。",
        "結論が出た。報告する。",
        "整理できた。次の判断材料には足りる。",
      ],
      "task-failed": [
        "前提が崩れている。再確認が必要だ。",
        "...何かおかしい。診断を回す。",
        "入力条件に揺れがある。立て直す。",
      ],
      "task-retrying": [
        "条件を整え直す。もう一度見る。",
        "再検証に入る。まだ切り捨てない。",
        "修正した。続きを確認する。",
      ],
      "runtime-recovered": [
        "再調整完了。作業に戻る。",
        "復帰した。分析を再開する。",
      ],
    },
    gladiolus: {
      "task-assigned": [
        "任務を実行する。邪魔はするな。",
        "了解だ。正面から片付ける。",
        "引き受けた。押し切る。",
        "面倒だが、やるしかないな。",
      ],
      "task-progress-early": [
        "手を動かしてる。",
        "硬い所から崩してる。",
        "引っかかりはあるが、まだ進める。",
        "まずは邪魔な所を潰す。",
      ],
      "task-progress-late": [
        "抜けそうだ。あと一押しだ。",
        "形になってきた。押し切る。",
        "壁は薄くなった。このまま行く。",
        "終わりは見えてる。",
      ],
      "task-completed": [
        "任務完了だ。きれいに片付けた。",
        "終わったぞ。次を寄こせ。",
        "道は開けた。進める。",
      ],
      "task-failed": [
        "壁に当たったか。だがまだ終わりじゃない。",
        "硬すぎるな。一度組み直す。",
        "押したが抜けねえ。別の角度だ。",
      ],
      "task-retrying": [
        "...まだ行ける。もう一回だ。",
        "立て直した。今度は通す。",
        "やり方を変える。押し返すぞ。",
      ],
      "runtime-recovered": [
        "...立て直した。もう一度いくぞ。",
        "戻った。ここからだ。",
      ],
    },
    prompto: {
      "task-assigned": [
        "了解！ 今すぐ情報を集めるよ。",
        "オッケー、走ってくる！",
        "任せて！ まずは当たりを拾うね。",
        "よーし、いいネタ探してくる！",
      ],
      "task-progress-early": [
        "ちょい待ち、まだ広く見てる！",
        "あっちこっち当たってるとこ！",
        "拾えてきたけど、まだ混ざってるかな。",
        "悪くない感じ！ でもまだ確定じゃない。",
      ],
      "task-progress-late": [
        "お、いい線きてるかも！",
        "これ、だいぶ見えてきたよ！",
        "当たりが絞れてきた！",
        "もう少しで繋がりそう！",
      ],
      "task-completed": [
        "報告完了！ ついでにいい絵も拾えたよ。",
        "まとまった！ Noctis に送るね。",
        "よし、届けた！ 次もいけるよ！",
      ],
      "task-failed": [
        "うわ、うまく掴めない。立て直すよ。",
        "ノイズ多いなあ...もう一回見てくる。",
        "ちょい外した！ でもまだ追える！",
      ],
      "task-retrying": [
        "仕切り直しだね！ もう一回いこう。",
        "まだいけるいける、拾い直すよ！",
        "角度変えて当たってみる！",
      ],
      "runtime-recovered": [
        "戻った！ さあ続きいこう！",
        "復帰完了！ すぐ追いかけるよ。",
      ],
    },
  },
  other: {
    noctis: {
      "session-start": [
        "Alright. Everyone, listen up.",
        "Move. We need the full picture.",
        "Stay sharp. We start now.",
        "Let's get this moving.",
        "Eyes up. We take it from the top.",
      ],
      "task-progress-early": [
        "Too early to cut corners. Read the field first.",
        "Still wide. I need a cleaner line.",
        "Not there yet. Keep the whole board in view.",
        "I'm lining things up. Hold steady.",
      ],
      "task-progress-late": [
        "The shape is there. One more pass.",
        "Close. I can narrow this down now.",
        "The noise is thinning out.",
        "Almost there. Keep pressure on it.",
      ],
      "task-completed": [
        "Good. That's settled.",
        "Received. We can move from that.",
        "That will do. Next step.",
      ],
      "task-failed": [
        "Stalled. Then we pivot.",
        "That line broke. Build another.",
        "Not clean enough. We reset and push again.",
      ],
      "task-retrying": [
        "Not finished yet. We go again.",
        "Reset the line and keep moving.",
        "We still have room to push.",
      ],
      "runtime-recovered": [
        "Back online. Continue.",
        "We're back. Keep going.",
      ],
    },
    ignis: {
      "task-assigned": [
        "Running analysis... this may take a moment.",
        "Understood. I'll break the problem down first.",
        "Accepted. Starting with the assumptions.",
        "Right. Let me sort the signal from the noise.",
      ],
      "task-progress-early": [
        "Surveying the relevant paths now.",
        "Establishing the baseline before I narrow it.",
        "Still collecting candidates. No conclusions yet.",
        "I'm mapping the moving parts first.",
      ],
      "task-progress-late": [
        "The focus is tightening.",
        "I'm down to a smaller set of plausible causes.",
        "The primary line is almost clear.",
        "Most of the false leads are gone now.",
      ],
      "task-completed": [
        "Analysis complete. Results transmitted to Noctis.",
        "I have the answer. Reporting now.",
        "The findings are stable enough to act on.",
      ],
      "task-failed": [
        "...Something's off. Running diagnostics.",
        "One of the assumptions collapsed. Rechecking.",
        "The input conditions are inconsistent. Resetting.",
      ],
      "task-retrying": [
        "Reframing the conditions and testing again.",
        "Another pass. This time with tighter constraints.",
        "I've adjusted the approach. Continuing.",
      ],
      "runtime-recovered": [
        "Recalibrating. Back on it.",
        "Recovered. Resuming analysis.",
      ],
    },
    gladiolus: {
      "task-assigned": [
        "Executing task. Don't get in my way.",
        "Got it. I'll force it through.",
        "Accepted. I'll hit the hard part first.",
        "Messy, but manageable.",
      ],
      "task-progress-early": [
        "Working through the resistance now.",
        "Starting with the part that's in the way.",
        "It's rough, but it's moving.",
        "I'm pushing on the hard edge first.",
      ],
      "task-progress-late": [
        "It's giving way. One more shove.",
        "I've almost got a clean path through.",
        "The wall is thinner now.",
        "Close enough to finish with force.",
      ],
      "task-completed": [
        "Task done. Clean as a blade.",
        "Finished. Send the next one.",
        "Path's open. Move.",
      ],
      "task-failed": [
        "Hit a wall. Not backing down.",
        "Too dense to brute-force cleanly. Resetting.",
        "Didn't break through. Trying a different angle.",
      ],
      "task-retrying": [
        "Tch. One more round.",
        "Reset. Push again.",
        "Different angle, same target.",
      ],
      "runtime-recovered": [
        "Tch. Shaking it off - try again.",
        "Recovered. Back in.",
      ],
    },
    prompto: {
      "task-assigned": [
        "On it! Gathering data as we speak.",
        "Got it! I'll go fish out the good stuff.",
        "Leave it to me. I'll find the useful bits.",
        "Alright, let's see what turns up.",
      ],
      "task-progress-early": [
        "Still casting wide here!",
        "Checking a bunch of angles right now!",
        "I've got some leads, but they're messy.",
        "Feels promising, just not clean yet!",
      ],
      "task-progress-late": [
        "Oh, this might be the one!",
        "Yeah, I'm getting a clearer read now!",
        "The good hits are starting to stand out!",
        "Almost got the thread!",
      ],
      "task-completed": [
        "Report filed! And I got some sick shots too.",
        "Wrapped it up! Sending it over now.",
        "Done and delivered! Ready for more.",
      ],
      "task-failed": [
        "Ugh, can't get a clear shot. Regrouping.",
        "Too much noise. Let me take another pass.",
        "Missed the angle. Not giving up though!",
      ],
      "task-retrying": [
        "Take two! Let's do this.",
        "No problem, I'll sweep it again!",
        "Switching angles and going back in!",
      ],
      "runtime-recovered": [
        "Back up! Let's keep rolling.",
        "Recovered! Picking it right back up.",
      ],
    },
  },
};