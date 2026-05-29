#ifndef VECTOR_MATH_H
#define VECTOR_MATH_H

#include <vector>
#include <cmath>

namespace NHAIEdgeAI {

class VectorMath {
public:
    /**
     * Calculates the Cosine Similarity between two face embedding vectors.
     * Target speed: Sub-microsecond execution.
     * Formula: Similarity = (A . B) / (||A|| * ||B||)
     */
    static float calculateCosineSimilarity(const std::vector<float>& vecA, const std::vector<float>& vecB) {
        if (vecA.size() != vecB.size() || vecA.empty()) {
            return 0.0f;
        }

        float dotProduct = 0.0f;
        float normA = 0.0f;
        float normB = 0.0f;

        size_t size = vecA.size();
        
        // Highly optimized arithmetic with compiler auto-vectorization hints
        for (size_t i = 0; i < size; ++i) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA == 0.0f || normB == 0.0f) {
            return 0.0f;
        }

        return dotProduct / (std::sqrt(normA) * std::sqrt(normB));
    }
};

} // namespace NHAIEdgeAI

#endif // VECTOR_MATH_H
