#pragma once

#include <windows.h>

#include <stdexcept>
#include <string>
#include <string_view>

struct WindowsHandle {
  HANDLE value = nullptr;
  explicit WindowsHandle(HANDLE handle = nullptr) : value(handle) {}
  WindowsHandle(const WindowsHandle &) = delete;
  WindowsHandle &operator=(const WindowsHandle &) = delete;
  WindowsHandle(WindowsHandle &&other) noexcept : value(other.value) {
    other.value = nullptr;
  }
  ~WindowsHandle() {
    if (value && value != INVALID_HANDLE_VALUE)
      CloseHandle(value);
  }
  explicit operator bool() const {
    return value && value != INVALID_HANDLE_VALUE;
  }
};

inline std::wstring widen(std::string_view value) {
  if (value.empty())
    return {};
  const int length =
      MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                          static_cast<int>(value.size()), nullptr, 0);
  if (!length)
    throw std::runtime_error("Text was not valid UTF-8");
  std::wstring result(static_cast<size_t>(length), L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length);
  return result;
}

inline std::string narrow(std::wstring_view value) {
  if (value.empty())
    return {};
  const int length = WideCharToMultiByte(
      CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
      static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (!length)
    throw std::runtime_error("Text could not be encoded as UTF-8");
  std::string result(static_cast<size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                      static_cast<int>(value.size()), result.data(), length,
                      nullptr, nullptr);
  return result;
}
