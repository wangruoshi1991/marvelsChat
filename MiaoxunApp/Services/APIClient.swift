import Foundation

enum APIClientError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case server(String)
    case decoding(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "API 地址无效。"
        case .invalidResponse:
            return "后端响应格式无效。"
        case .server(let message):
            return message
        case .decoding(let message):
            return message
        }
    }
}

final class APIClient {
    static let shared = APIClient(baseURL: APIClient.defaultBaseURL)

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private static var defaultBaseURL: URL {
        if let configuredValue = Bundle.main.object(forInfoDictionaryKey: "MiaoxunAPIBaseURL") as? String,
           let configuredURL = URL(string: configuredValue) {
            return configuredURL
        }

        #if targetEnvironment(simulator)
        return URL(string: "http://127.0.0.1:4390")!
        #else
        return URL(string: "http://172.20.10.5:4390")!
        #endif
    }

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func login(identifier: String, password: String) async throws -> AuthResponse {
        try await request(
            path: "/api/auth/login",
            method: "POST",
            body: LoginPayload(identifier: identifier, password: password),
            token: nil
        )
    }

    func register(email: String, password: String, displayName: String) async throws -> AuthResponse {
        try await request(
            path: "/api/auth/register",
            method: "POST",
            body: RegisterPayload(email: email, password: password, displayName: displayName),
            token: nil
        )
    }

    func bootstrap(token: String) async throws -> BootstrapDTO {
        try await request(path: "/api/app/bootstrap", method: "GET", body: Optional<String>.none, token: token)
    }

    func sync(updatedAfter: String?, token: String) async throws -> AppSyncDTO {
        let path: String
        if let updatedAfter,
           let escaped = updatedAfter.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path = "/api/app/sync?updatedAfter=\(escaped)"
        } else {
            path = "/api/app/sync"
        }
        return try await request(path: path, method: "GET", body: Optional<String>.none, token: token)
    }

    func messages(threadId: String, token: String) async throws -> [MessageDTO] {
        try await request(path: "/api/threads/\(threadId)/messages", method: "GET", body: Optional<String>.none, token: token)
    }

    func messages(threadId: String, after: String, token: String) async throws -> [MessageDTO] {
        let escapedAfter = after.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? after
        return try await request(
            path: "/api/threads/\(threadId)/messages?after=\(escapedAfter)",
            method: "GET",
            body: Optional<String>.none,
            token: token
        )
    }

    func sendMessage(
        threadId: String,
        content: String,
        clientContext: ButlerClientContextPayload?,
        localActionResult: ButlerLocalActionResultPayload?,
        token: String
    ) async throws -> SendMessageResponse {
        try await request(
            path: "/api/threads/\(threadId)/messages",
            method: "POST",
            body: SendMessagePayload(
                content: content,
                clientContext: clientContext,
                localActionResult: localActionResult
            ),
            token: token
        )
    }

    func updateStationConfig(language: String?, appearance: String?, token: String) async throws -> ProfileDTO {
        try await request(
            path: "/api/me/station-config",
            method: "PATCH",
            body: StationConfigPayload(language: language, appearance: appearance),
            token: token
        )
    }

    func logout(token: String) async throws {
        let _: OkResponse = try await request(path: "/api/auth/logout", method: "POST", body: Optional<String>.none, token: token)
    }

    func markThreadRead(threadId: String, token: String) async throws {
        let _: OkResponse = try await request(
            path: "/api/threads/\(threadId)/read",
            method: "POST",
            body: Optional<String>.none,
            token: token
        )
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?,
        token: String?
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIClientError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }

        if !(200..<300).contains(httpResponse.statusCode) {
            if let payload = try? decoder.decode(APIErrorEnvelope.self, from: data) {
                throw APIClientError.server(payload.error.message)
            }
            throw APIClientError.server("请求失败：\(httpResponse.statusCode)")
        }

        if data.isEmpty, Response.self == EmptyData.self {
            return EmptyData() as! Response
        }

        do {
            return try decoder.decode(APIEnvelope<Response>.self, from: data).data
        } catch {
            throw APIClientError.decoding("响应解析失败：\(error.localizedDescription)")
        }
    }
}

struct EmptyData: Decodable {}

private struct StationConfigPayload: Encodable {
    let language: String?
    let appearance: String?
}
