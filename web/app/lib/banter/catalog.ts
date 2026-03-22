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
      "task-delegated": [
        "任せた。進捗が出たらすぐ寄こせ。",
        "お前に振る。片がついたら知らせろ。",
        "この線は任せる。拾ったものは全部上げてくれ。",
        "そっちで見てくれ。動きがあればすぐ共有だ。",
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
      "message-received": [
        "了解した。内容を確認する。",
        "受け取った。すぐに整理へ入る。",
        "指示は把握した。前提から確認する。",
        "承知した。まずは論点を揃えよう。",
      ],
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
      "report-running": [
        "途中経過を送った。引き続き確認を進める。",
        "現時点の整理を Noctis に共有した。",
        "中間報告は送信済みだ。作業を継続する。",
      ],
      "report-blocked": [
        "阻害要因を Noctis に伝えた。判断を仰ぐ。",
        "詰まりがある。状況は共有済みだ。",
        "いったん障害を報告した。次の条件を待つ。",
      ],
      "report-completed": [
        "結論を Noctis に送った。次の判断に使えるはずだ。",
        "報告済みだ。必要な材料は揃えた。",
        "結果は渡した。次の判断に移れる。",
      ],
      "report-failed": [
        "失敗として報告した。条件の見直しが必要だ。",
        "今回は崩れた。Noctis には伝えてある。",
        "成立しなかった。報告は送信済みだ。",
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
      "message-received": [
        "了解だ。こっちで片付ける。",
        "受け取った。すぐ動く。",
        "話は分かった。正面から行くぞ。",
        "任せろ。まずはぶつかってみる。",
      ],
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
      "report-running": [
        "途中経過は送った。このまま押す。",
        "今の状況は Noctis に伝えた。続けるぞ。",
        "中間報告を入れた。まだ手は止めねえ。",
      ],
      "report-blocked": [
        "止まった理由は送ってある。次の一手を待つ。",
        "壁に当たったって報告した。まだ諦めてねえ。",
        "詰まりは共有済みだ。立て直しに入る。",
      ],
      "report-completed": [
        "終わった。Noctis に報告も済ませた。",
        "片付けた。結果はもう渡してある。",
        "道は開けた。報告は上げたぞ。",
      ],
      "report-failed": [
        "抜けなかったって伝えた。次は別の角度だ。",
        "失敗として上げた。まだ終わりじゃねえ。",
        "今回は崩れた。報告はもう出してある。",
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
      "message-received": [
        "了解！ すぐ見てくるね！",
        "受け取ったよ！ まずは当たりを探す！",
        "オッケー、内容は把握した！",
        "任せて！ こっちで追ってみる！",
      ],
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
      "report-running": [
        "途中経過を送ったよ！ まだ掘れる！",
        "いま分かった分は Noctis に共有した！",
        "中間報告オッケー！ このまま続けるね！",
      ],
      "report-blocked": [
        "引っかかってるって送った！ ちょい立て直す！",
        "詰まりを報告したよ。別の線も当たってみる！",
        "今の問題は共有済み！ もう一回探ってみるね！",
      ],
      "report-completed": [
        "報告送ったよ！ 使えそうなネタもまとめといた！",
        "完了って伝えた！ 次もいけるよ！",
        "結果は Noctis に届けた！ いい感じ！",
      ],
      "report-failed": [
        "だめだったって送った！ でもまだ探れる！",
        "今回は外したって報告したよ。次で巻き返す！",
        "失敗報告は済ませた！ もう一回当たり直すね！",
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
      "task-delegated": [
        "I'm handing this off. Report back the moment it moves.",
        "Your turn. Send me anything useful right away.",
        "Take this line and keep me posted.",
        "Handle it. I want updates as soon as you have them.",
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
      "message-received": [
        "Understood. I'll review the details now.",
        "Received. I'll sort the constraints first.",
        "Got it. Starting from the assumptions.",
        "Acknowledged. I'll structure the problem first.",
      ],
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
      "report-running": [
        "I've sent an interim update to Noctis. Continuing.",
        "Current findings are with Noctis now. I'll keep digging.",
        "Midpoint report sent. Work is still in progress.",
      ],
      "report-blocked": [
        "I've reported the blocker to Noctis. Awaiting the next decision.",
        "The obstruction is logged with Noctis now.",
        "Blocked for the moment. Noctis has the details.",
      ],
      "report-completed": [
        "Final report sent to Noctis. The conclusions should be actionable.",
        "I've delivered the result to Noctis.",
        "The report is in. We can act on it now.",
      ],
      "report-failed": [
        "I've reported the failure. The setup needs another pass.",
        "This line failed. Noctis has the full summary.",
        "Failure transmitted. The conditions need revisiting.",
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
      "message-received": [
        "Got it. I'll handle it from here.",
        "Received. Moving now.",
        "Yeah, I heard you. I'll hit it head-on.",
        "Leave it with me. I'll push through it.",
      ],
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
      "report-running": [
        "Sent the update. I'm still pushing.",
        "Noctis has the current status. I'm not done yet.",
        "Mid-run report is out. I keep moving.",
      ],
      "report-blocked": [
        "I told Noctis what stopped me. I'll reset and push again.",
        "Blocker reported. I'm lining up the next hit.",
        "Noctis knows where it jammed. I'm not backing off.",
      ],
      "report-completed": [
        "Done. Noctis has the report already.",
        "Wrapped it up and sent the result.",
        "Path's open. Report delivered.",
      ],
      "report-failed": [
        "Didn't break through. I reported it.",
        "Failure's logged with Noctis. Next round won't miss.",
        "That push failed. Noctis has the summary now.",
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
      "message-received": [
        "Got it! I'll check it out right now!",
        "Received! Let me chase the good leads!",
        "Okay, I'm on it!",
        "Leave it to me! I'll track it down!",
      ],
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
      "report-running": [
        "I sent a progress update! Still chasing more.",
        "Noctis has the latest from me. I'm keeping at it!",
        "Midpoint report sent! I'm not done yet!",
      ],
      "report-blocked": [
        "I told Noctis what's blocking me! I'll try another angle!",
        "Blocker reported! Let me regroup and sweep again!",
        "Noctis has the bad news. I'm still hunting for a way through!",
      ],
      "report-completed": [
        "Report sent! Everything useful is packed in there!",
        "Done and delivered to Noctis!",
        "Final update's out! Ready for the next run!",
      ],
      "report-failed": [
        "I sent the failure report. I'll line up another shot!",
        "That one missed. Noctis has the details now!",
        "Failure reported! I'll come back with a better angle!",
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