import Foundation

struct APIEnvelope<T: Decodable>: Decodable {
    let data: T
}

struct APIErrorEnvelope: Decodable {
    let error: APIErrorBody
}

struct APIErrorBody: Decodable {
    let message: String
}

struct LoginPayload: Encodable {
    let identifier: String
    let password: String
}

struct RegisterPayload: Encodable {
    let email: String
    let password: String
    let displayName: String
}

struct AuthResponse: Decodable {
    let user: UserDTO
    let session: SessionDTO
}

struct SessionDTO: Decodable {
    let token: String
    let expiresAt: String
}

struct UserDTO: Decodable, Identifiable {
    let id: String
    let loginName: String?
    let email: String
    let displayName: String
    let aiId: String
    let role: String
    let status: String?
    let createdAt: String?
    let lastLoginAt: String?
}

struct BootstrapDTO: Decodable {
    let serverTime: String?
    let user: UserDTO
    let profile: ProfileDTO
    let threads: [ThreadDTO]
    let messagesByThread: [String: [MessageDTO]]
    let agents: BootstrapAgentsDTO
    let modules: [String: ModuleDTO]
}

struct AppSyncDTO: Decodable {
    let threads: [ThreadDTO]
    let messagesByThread: [String: [MessageDTO]]
    let serverTime: String
}

struct ProfileDTO: Decodable {
    let userId: String
    let nickname: String
    let avatarText: String
    let bio: String
    let community: String
    let activityArea: String
    let miaoPoints: Int
    let followingCount: Int
    let followersCount: Int
    let collectionsCount: Int
    let stationConfig: [String: String]
}

struct ThreadDTO: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String?
    let avatarText: String
    let agentId: String?
    let kind: String
    let pinned: Bool
    let lastContent: String
    let lastMessageAt: String?
    let unreadCount: Int
}

struct MessageDTO: Decodable, Identifiable {
    let id: String
    let threadId: String
    let senderType: String
    let senderName: String
    let content: String
    let createdAt: String?
}

struct AgentDTO: Decodable, Identifiable {
    var id: String { key }

    let key: String
    let name: String
    let version: String
    let category: String
    let description: String
    let capabilities: [String]
    let permissions: [String]
    let status: String
}

struct BootstrapAgentsDTO: Decodable {
    let registered: [AgentDTO]
    let owned: [OwnedAgentDTO]
}

struct OwnedAgentDTO: Decodable, Identifiable {
    let id: String
    let name: String
    let description: String
    let category: String
    let enabled: Bool
    let grantedScopes: [String]
    let createdAt: String?
}

struct ModuleDTO: Decodable {
    let key: String
    let title: String
    let status: String
    let label: String
    let description: String
    let needs: [String]?
}

struct SendMessagePayload: Encodable {
    let content: String
    let clientContext: ButlerClientContextPayload?
    let localActionResult: ButlerLocalActionResultPayload?
}

struct ButlerClientContextPayload: Encodable {
    let currentPage: String
    let language: String
    let appearance: String
    let profileSnapshot: ButlerProfileSnapshotPayload
    let enabledAgentIds: [String]
}

struct ButlerProfileSnapshotPayload: Encodable {
    let nickname: String
    let followersCount: Int
    let followingCount: Int
    let collectionsCount: Int
    let miaoPoints: Int
}

struct ButlerLocalActionResultPayload: Encodable {
    let type: String
    let status: String
    let message: String
}

struct SendMessageResponse: Decodable {
    let messages: [MessageDTO]
    let agentRun: AgentRunDTO?
}

struct AgentRunDTO: Decodable, Identifiable {
    let id: String
    let agentId: String
    let status: String
    let provider: String
    let latencyMs: Int?
    let tokenTotal: Int?
}

struct OkResponse: Decodable {
    let ok: Bool
}
