import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { MessageDetailSheetBase } from "@/components/chat/message-detail-sheet-base";

type Props = {
  content: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  senderLabel: string;
};

const MessageDetailSheet = ({ content, onOpenChange, open, senderLabel }: Props) => {
  return (
    <MessageDetailSheetBase
      copyContent={content}
      description="Full markdown detail view"
      onOpenChange={onOpenChange}
      open={open}
      title={`${senderLabel} message detail`}
    >
      <div className="rounded-xl border border-white/10 bg-white/3 p-4 sm:p-5">
        <div className="markdown-body text-[13px] leading-6 [&_li]:leading-6 [&_p]:leading-6">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{content}</ReactMarkdown>
        </div>
      </div>
    </MessageDetailSheetBase>
  );
};

export default MessageDetailSheet;
