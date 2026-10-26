#include "updater.hpp"
#include "windows_support.hpp"

#include <winhttp.h>

namespace {
struct HttpHandle {
  HINTERNET value = nullptr;
  explicit HttpHandle(HINTERNET handle = nullptr) : value(handle) {}
  HttpHandle(const HttpHandle &) = delete;
  HttpHandle &operator=(const HttpHandle &) = delete;
  ~HttpHandle() {
    if (value)
      WinHttpCloseHandle(value);
  }
  explicit operator bool() const { return value != nullptr; }
};
} // namespace

HttpResponse http_request(const std::string &method, const std::string &url,
                          const HttpHeaders &extra_headers,
                          const std::string &body) {
  const auto wide_url = widen(url);
  URL_COMPONENTS components{};
  components.dwStructSize = sizeof(components);
  components.dwSchemeLength = static_cast<DWORD>(-1);
  components.dwHostNameLength = static_cast<DWORD>(-1);
  components.dwUrlPathLength = static_cast<DWORD>(-1);
  components.dwExtraInfoLength = static_cast<DWORD>(-1);
  if (!WinHttpCrackUrl(wide_url.c_str(), 0, 0, &components))
    throw std::runtime_error("Request URL is invalid");
  const std::wstring host(components.lpszHostName, components.dwHostNameLength);
  const bool secure = components.nScheme == INTERNET_SCHEME_HTTPS;
  if (!secure && (components.nScheme != INTERNET_SCHEME_HTTP ||
                  _wcsicmp(host.c_str(), L"localhost") != 0))
    throw std::runtime_error("Request URL must use HTTPS");
  std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);
  if (components.dwExtraInfoLength)
    path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
  HttpHandle session(
      WinHttpOpen(L"OrdisPrimeUpdater/0.2", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                  WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
  if (!session)
    throw std::runtime_error("Could not initialize HTTPS");
  WinHttpSetTimeouts(session.value, 10'000, 10'000, 30'000, 30'000);
  HttpHandle connection(
      WinHttpConnect(session.value, host.c_str(), components.nPort, 0));
  if (!connection)
    throw std::runtime_error("Could not connect to server");
  HttpHandle request(WinHttpOpenRequest(
      connection.value, widen(method).c_str(), path.c_str(), nullptr,
      WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
      secure ? WINHTTP_FLAG_SECURE : 0));
  if (!request)
    throw std::runtime_error("Could not create HTTPS request");
  DWORD redirect_policy = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
  if (!WinHttpSetOption(request.value, WINHTTP_OPTION_REDIRECT_POLICY,
                        &redirect_policy, sizeof(redirect_policy)))
    throw std::runtime_error("Could not secure HTTPS redirect handling");
  std::wstring headers;
  for (const auto &[name, value] : extra_headers)
    headers += widen(name + ": " + value + "\r\n");
  auto *request_body =
      body.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<char *>(body.data());
  if (!WinHttpSendRequest(request.value,
                          headers.empty() ? WINHTTP_NO_ADDITIONAL_HEADERS
                                          : headers.c_str(),
                          static_cast<DWORD>(headers.size()), request_body,
                          static_cast<DWORD>(body.size()),
                          static_cast<DWORD>(body.size()), 0) ||
      !WinHttpReceiveResponse(request.value, nullptr))
    throw std::runtime_error("HTTPS request failed");
  DWORD status = 0;
  DWORD status_size = sizeof(status);
  WinHttpQueryHeaders(request.value,
                      WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                      WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size,
                      WINHTTP_NO_HEADER_INDEX);
  std::string response;
  while (true) {
    DWORD available = 0;
    if (!WinHttpQueryDataAvailable(request.value, &available))
      throw std::runtime_error("Could not read HTTPS response");
    if (!available)
      break;
    if (response.size() + available > 12 * 1024 * 1024)
      throw std::runtime_error("HTTPS response was too large");
    const auto offset = response.size();
    response.resize(offset + available);
    DWORD received = 0;
    if (!WinHttpReadData(request.value, response.data() + offset, available,
                         &received))
      throw std::runtime_error("Could not read HTTPS response");
    response.resize(offset + received);
  }
  return {static_cast<long>(status), std::move(response)};
}
