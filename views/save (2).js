#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <windows.h>
#include <ctime>
#include <cstdlib>

std::vector<char> xorEncrypt(const std::vector<char>& data, const std::string& key) {
    std::vector<char> result;
    for (size_t i = 0; i < data.size(); ++i) {
        result.push_back(data[i] ^ key[i % key.length()]);
    }
    return result;
}

std::string generateRandomFilename(size_t length = 12) {
    const char charset[] =
        "abcdefghijklmnopqrstuvwxyz"
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "0123456789";
    const size_t max_index = sizeof(charset) - 2;

    std::string randomStr;
    for (size_t i = 0; i < length; ++i) {
        randomStr += charset[rand() % max_index];
    }
    return randomStr;
}

std::string getHiddenInput(const std::string& prompt) {
    std::string password;
    std::cout << prompt;

    HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
    DWORD mode = 0;
    GetConsoleMode(hStdin, &mode);

    DWORD oldMode = mode;
    mode &= ~ENABLE_ECHO_INPUT; // Disable echo
    SetConsoleMode(hStdin, mode);

    std::getline(std::cin, password); // Read input

    SetConsoleMode(hStdin, oldMode); // Restore echo
    std::cout << std::endl;
    return password;
}

int main() {
    std::srand(static_cast<unsigned int>(std::time(nullptr)));

    // === Hardcoded directories ===
    std::string inputDir = "C:\\Users\\Christopher Hobson\\Docum";
    std::string outputDir = "C:\\Users\\Christopher Hobson\\Downloads\\connector-ehr\\dist\\db\\";

    // Ensure paths end with backslash
    if (!inputDir.empty() && inputDir.back() != '\\') inputDir += "\\";
    if (!outputDir.empty() && outputDir.back() != '\\') outputDir += "\\";

    std::string key = getHiddenInput(":");

    WIN32_FIND_DATA findFileData;
    HANDLE hFind = INVALID_HANDLE_VALUE;

    std::string searchPath = inputDir + "*";

    hFind = FindFirstFile(searchPath.c_str(), &findFileData);

    if (hFind == INVALID_HANDLE_VALUE) {
        std::cerr << "Invalid input directory or no files found." << std::endl;
        return 1;
    }

    do {
        const std::string fileName = findFileData.cFileName;

        if (fileName == "." || fileName == "..")
            continue;

        if (!(findFileData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) {
            std::string inputFilePath = inputDir + fileName;

            std::ifstream inFile(inputFilePath, std::ios::binary);
            if (!inFile) {
                std::cerr << "Failed to open file: " << inputFilePath << std::endl;
                continue;
            }

            std::vector<char> fileData((std::istreambuf_iterator<char>(inFile)), std::istreambuf_iterator<char>());
            inFile.close();

            std::vector<char> encryptedData = xorEncrypt(fileData, key);

            std::string outputFilePath;
            do {
                outputFilePath = outputDir + generateRandomFilename();
            } while (GetFileAttributes(outputFilePath.c_str()) != INVALID_FILE_ATTRIBUTES);

            std::ofstream outFile(outputFilePath, std::ios::binary);
            if (!outFile) {
                std::cerr << "Failed to write file: " << outputFilePath << std::endl;
                continue;
            }

            outFile.write(&encryptedData[0], encryptedData.size());
            outFile.close();

            std::cout << "Complete: " << fileName << " -> " << outputFilePath << std::endl;
        }

    } while (FindNextFile(hFind, &findFileData) != 0);

    FindClose(hFind);

    std::cout << "completed." << std::endl;
    return 0;
}
