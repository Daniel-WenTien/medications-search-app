#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <windows.h>

// XOR decryption function
std::vector<char> xorDecrypt(const std::vector<char>& data, const std::string& key) {
    std::vector<char> result;
    for (size_t i = 0; i < data.size(); ++i) {
        result.push_back(data[i] ^ key[i % key.length()]);
    }
    return result;
}

// Hidden password input
std::string getHiddenInput(const std::string& prompt) {
    std::string password;
    std::cout << prompt;

    HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
    DWORD mode;
    GetConsoleMode(hStdin, &mode);

    DWORD oldMode = mode;
    mode &= ~ENABLE_ECHO_INPUT;
    SetConsoleMode(hStdin, mode);

    std::getline(std::cin, password);

    SetConsoleMode(hStdin, oldMode);
    std::cout << std::endl;
    return password;
}

int main() {
    std::string inputDir = "D:\\test\\";   // directory with encrypted files
    std::string outputDir = "D:\\test2\\"; // where decrypted files go

    if (!inputDir.empty() && inputDir.back() != '\\') inputDir += "\\";
    if (!outputDir.empty() && outputDir.back() != '\\') outputDir += "\\";

    std::string key = getHiddenInput(": ");

    WIN32_FIND_DATA findFileData;
    HANDLE hFind;

    std::string searchPath = inputDir + "*"; // look for .db files
    hFind = FindFirstFile(searchPath.c_str(), &findFileData);

    if (hFind == INVALID_HANDLE_VALUE) {
        std::cerr << "Invalid input directory" << std::endl;
        return 1;
    }

    do {
        const std::string fileName = findFileData.cFileName;
        if (fileName == "." || fileName == "..") continue;

        if (!(findFileData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) {
            std::string inputFilePath = inputDir + fileName;

            std::ifstream inFile(inputFilePath, std::ios::binary);
            if (!inFile) {
                std::cerr << "Failed to open file: " << inputFilePath << std::endl;
                continue;
            }

            std::vector<char> fileData((std::istreambuf_iterator<char>(inFile)), std::istreambuf_iterator<char>());
            inFile.close();

            std::vector<char> decryptedData = xorDecrypt(fileData, key);

            std::string outputFilePath = outputDir + fileName + ".dec";

            std::ofstream outFile(outputFilePath, std::ios::binary);
            if (!outFile) {
                std::cerr << "Failed to write file: " << outputFilePath << std::endl;
                continue;
            }

            outFile.write(decryptedData.data(), decryptedData.size());
            outFile.close();

            std::cout << "Completed: " << fileName << " -> " << outputFilePath << std::endl;
        }

    } while (FindNextFile(hFind, &findFileData) != 0);

    FindClose(hFind);
    std::cout << "completed." << std::endl;
    return 0;
}
