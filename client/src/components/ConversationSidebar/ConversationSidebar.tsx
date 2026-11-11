import "./conversationSidebar.scss";
export type Conversation = {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
};

type ConversationSidebarProps = {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
};

function ConversationSidebar({
  conversations,
  activeConversationId,
  isLoading,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
}: ConversationSidebarProps) {
  return (
    <aside className="conversation-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Your conversations</span>

        <button type="button" onClick={onNewChat}>
          + New chat
        </button>
      </div>

      <div className="conversation-list">
        {isLoading && (
          <p className="sidebar-empty">Loading conversations...</p>
        )}

        {!isLoading && conversations.length === 0 && (
          <p className="sidebar-empty">No conversations yet.</p>
        )}

        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`conversation-item ${
              activeConversationId === conversation.id ? "active" : ""
            }`}
          >
            <button
              type="button"
              className="conversation-select"
              onClick={() => onSelectConversation(conversation.id)}
              title={conversation.title}
            >
              {conversation.title}
            </button>

            <button
              type="button"
              className="conversation-delete"
              aria-label={`Delete ${conversation.title}`}
              onClick={() => onDeleteConversation(conversation.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default ConversationSidebar;
