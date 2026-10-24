cmake_minimum_required(VERSION 3.24)
project(ordis_prime_updater VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(ordis_pairing src/pairing.cpp)
target_include_directories(ordis_pairing PUBLIC src)

enable_testing()
add_executable(ordis_pairing_test test/pairing_test.cpp)
target_link_libraries(ordis_pairing_test PRIVATE ordis_pairing)
add_test(NAME pairing-code COMMAND ordis_pairing_test)

if(WIN32)
  add_executable(ordis-prime-updater src/main.cpp)
  target_link_libraries(ordis-prime-updater PRIVATE ordis_pairing winhttp)
  target_compile_definitions(ordis-prime-updater PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
  if(MSVC)
    target_compile_options(ordis-prime-updater PRIVATE /W4 /permissive-)
    target_compile_options(ordis_pairing PRIVATE /W4 /permissive-)
  endif()
endif()
