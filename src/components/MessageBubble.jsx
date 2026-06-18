import ToolCallCard from './ToolCallCard';
import ReasoningBlock from './ReasoningBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MessageBubble({ message }) {
    const isUser = message.role === 'user';

    const toolParts = (message.parts || []).filter(p => p.type?.startsWith('tool-') || p.type === 'tool-invocation');
    const hasToolParts = toolParts.length > 0;
    const toolsToRender = hasToolParts ? toolParts : (message.toolInvocations || []);

    return (
        <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
            <div className="message-avatar">
                {isUser ? 'You' : 'AI'}
            </div>
            <div className="message-content">

                {message.parts?.map((part, i) => {
                    if (part.type === 'text' && part.text) {
                        return (
                            <div key={i} className="message-text">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {part.text}
                                </ReactMarkdown>
                            </div>
                        );
                    }
                    if (part.type === 'reasoning') {
                        return <ReasoningBlock key={part.id || i} part={part} />;
                    }
                    return null;
                })}

                {(!message.parts || message.parts.filter(p => p.type === 'text').length === 0) && message.content && (
                    <div className="message-text">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                        </ReactMarkdown>
                    </div>
                )}

                {toolsToRender.map((tool, i) => (
                    <ToolCallCard key={tool.toolCallId || i} part={tool} />
                ))}

            </div>
        </div>
    );
}