cmake_minimum_required(VERSION 3.22)
project(ordis_prime_updater VERSION 0.2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(ordis_pairing src/pairing.cpp)
target_include_directories(ordis_pairing PUBLIC src)
add_library(ordis_scheduler src/scheduler.cpp)
target_include_directories(ordis_scheduler PUBLIC src)

set(ORDIS_COMMON_SOURCES
  src/main.cpp
  src/api.cpp
  src/updater.cpp
)

if(WIN32)
  set(ORDIS_PLATFORM_SOURCES
    src/http_windows.cpp
    src/platform_windows.cpp
    src/process_windows.cpp
    src/tray_windows.cpp
  )
else()
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(CURL REQUIRED IMPORTED_TARGET libcurl)
  pkg_check_modules(APPINDICATOR REQUIRED IMPORTED_TARGET ayatana-appindicator3-0.1)
  set(ORDIS_PLATFORM_SOURCES
    src/http_linux.cpp
    src/platform_linux.cpp
    src/process_linux.cpp
    src/tray_linux.cpp
  )
endif()

add_executable(ordis-prime-updater ${ORDIS_COMMON_SOURCES} ${ORDIS_PLATFORM_SOURCES})
target_include_directories(ordis-prime-updater PRIVATE src)
target_link_libraries(ordis-prime-updater PRIVATE ordis_pairing ordis_scheduler)

enable_testing()
function(ordis_enable_test_assertions target)
  if(MSVC)
    target_compile_options(${target} PRIVATE /UNDEBUG)
  else()
    target_compile_options(${target} PRIVATE -UNDEBUG)
  endif()
endfunction()

add_executable(ordis_pairing_test test/pairing_test.cpp)
target_link_libraries(ordis_pairing_test PRIVATE ordis_pairing)
ordis_enable_test_assertions(ordis_pairing_test)
add_test(NAME pairing-code COMMAND ordis_pairing_test)
add_executable(ordis_scheduler_test test/scheduler_test.cpp)
target_link_libraries(ordis_scheduler_test PRIVATE ordis_scheduler)
ordis_enable_test_assertions(ordis_scheduler_test)
add_test(NAME tray-schedule COMMAND ordis_scheduler_test)
add_executable(ordis_updater_test test/updater_test.cpp src/updater.cpp)
target_include_directories(ordis_updater_test PRIVATE src)
ordis_enable_test_assertions(ordis_updater_test)
add_test(NAME updater-common COMMAND ordis_updater_test)

if(WIN32)
  target_link_libraries(ordis-prime-updater PRIVATE winhttp advapi32 bcrypt shell32)
  target_compile_definitions(ordis-prime-updater PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
  if(MSVC)
    target_compile_options(ordis-prime-updater PRIVATE /W4 /permissive-)
    target_compile_options(ordis_pairing PRIVATE /W4 /permissive-)
  endif()
else()
  target_link_libraries(ordis-prime-updater PRIVATE PkgConfig::CURL PkgConfig::APPINDICATOR pthread)
  target_compile_options(ordis-prime-updater PRIVATE -Wall -Wextra -Wpedantic)
  add_executable(ordis_platform_linux_test test/platform_linux_test.cpp src/updater.cpp src/platform_linux.cpp)
  target_include_directories(ordis_platform_linux_test PRIVATE src)
  target_compile_options(ordis_platform_linux_test PRIVATE -Wall -Wextra -Wpedantic)
  ordis_enable_test_assertions(ordis_platform_linux_test)
  add_test(NAME linux-platform-state COMMAND ordis_platform_linux_test)
endif()
