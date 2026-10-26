#include "updater.hpp"

#include <curl/curl.h>

#include <mutex>

namespace {
constexpr size_t maximum_response_bytes = 12 * 1024 * 1024;

size_t append_response(char *data, size_t size, size_t count, void *target) {
  const size_t length = size * count;
  auto &response = *static_cast<std::string *>(target);
  if (length > maximum_response_bytes - response.size())
    return 0;
  response.append(data, length);
  return length;
}

void initialize_curl() {
  static std::once_flag once;
  std::call_once(once, [] {
    if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK)
      throw std::runtime_error("Could not initialize HTTPS");
  });
}

bool secure_url(const std::string &url) {
  if (url.starts_with("https://"))
    return true;
  if (!url.starts_with("http://localhost"))
    return false;
  const auto suffix = std::string_view(url).substr(16);
  return suffix.empty() || suffix[0] == '/' || suffix[0] == ':';
}
} // namespace

HttpResponse http_request(const std::string &method, const std::string &url,
                          const HttpHeaders &extra_headers,
                          const std::string &body) {
  if (!secure_url(url))
    throw std::runtime_error("Request URL must use HTTPS");
  initialize_curl();
  CURL *raw = curl_easy_init();
  if (!raw)
    throw std::runtime_error("Could not initialize HTTPS request");
  struct CurlCleanup {
    CURL *value;
    ~CurlCleanup() { curl_easy_cleanup(value); }
  } cleanup{raw};
  curl_slist *header_list = nullptr;
  struct HeaderCleanup {
    curl_slist *&value;
    ~HeaderCleanup() { curl_slist_free_all(value); }
  } header_cleanup{header_list};
  for (const auto &[name, value] : extra_headers)
    header_list = curl_slist_append(header_list, (name + ": " + value).c_str());

  std::string response;
  curl_easy_setopt(raw, CURLOPT_URL, url.c_str());
  curl_easy_setopt(raw, CURLOPT_USERAGENT, "OrdisPrimeUpdater/0.2");
  curl_easy_setopt(raw, CURLOPT_CONNECTTIMEOUT_MS, 10'000L);
  curl_easy_setopt(raw, CURLOPT_TIMEOUT_MS, 30'000L);
  curl_easy_setopt(raw, CURLOPT_FOLLOWLOCATION, 0L);
#if LIBCURL_VERSION_NUM >= 0x075500
  curl_easy_setopt(raw, CURLOPT_PROTOCOLS_STR, "http,https");
  curl_easy_setopt(raw, CURLOPT_REDIR_PROTOCOLS_STR, "");
#else
  curl_easy_setopt(raw, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
  curl_easy_setopt(raw, CURLOPT_REDIR_PROTOCOLS, 0L);
#endif
  curl_easy_setopt(raw, CURLOPT_HTTPHEADER, header_list);
  curl_easy_setopt(raw, CURLOPT_WRITEFUNCTION, append_response);
  curl_easy_setopt(raw, CURLOPT_WRITEDATA, &response);
  if (method == "POST") {
    curl_easy_setopt(raw, CURLOPT_POST, 1L);
    curl_easy_setopt(raw, CURLOPT_POSTFIELDS, body.data());
    curl_easy_setopt(raw, CURLOPT_POSTFIELDSIZE_LARGE,
                     static_cast<curl_off_t>(body.size()));
  } else if (method != "GET") {
    curl_easy_setopt(raw, CURLOPT_CUSTOMREQUEST, method.c_str());
  }
  const auto result = curl_easy_perform(raw);
  if (result != CURLE_OK)
    throw std::runtime_error(std::string("HTTPS request failed: ") +
                             curl_easy_strerror(result));
  long status = 0;
  curl_easy_getinfo(raw, CURLINFO_RESPONSE_CODE, &status);
  return {status, std::move(response)};
}
