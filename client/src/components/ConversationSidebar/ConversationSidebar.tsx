
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
        <span className="sidebar-title">Recent Chats</span>

        <button
          type="button"
          className="new-chat-button"
          onClick={onNewChat}
        >
          <span className="new-chat-icon" aria-hidden="true">
            +
          </span>
          <span className="new-chat-label">New Chat</span>
        </button>
      </div>

      <div className="conversation-list">
        <div className="conversation-section-heading">
          <span>Recent Chats</span>
          <div className="sidebar-divider" />
        </div>
        {isLoading && (
          <p className="sidebar-empty">Loading conversations...</p>
        )}

        {!isLoading && conversations.length === 0 && (
          <p className="sidebar-empty">No conversations yet.</p>
        )}

        {conversations.map((conversation) => (
          <div
            key={conversation.id}
            className={`conversation-item ${activeConversationId === conversation.id ? "active" : ""
              }`}
          >
            <button
              type="button"
              className="conversation-select"
              onClick={() => onSelectConversation(conversation.id)}
              title={conversation.title}
            >
              <svg
                className="conversation-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
              </svg>

              <span className="conversation-title">
                {conversation.title}
              </span>
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
