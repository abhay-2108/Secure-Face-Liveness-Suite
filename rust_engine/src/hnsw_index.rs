//! # Vector Database Module
//!
//! Real HNSW index for approximate nearest neighbor search.

use hnsw_rs::prelude::{DistCosine, Hnsw, Neighbour};
use std::collections::HashMap;

pub struct HNSWGraph {
    max_elements: usize,
    m: usize,
    ef_construction: usize,
    ef_search: usize,
    dim: usize,
    hnsw: Hnsw<'static, f32, DistCosine>,
    labels: Vec<String>,
    label_to_id: HashMap<String, usize>,
}

impl HNSWGraph {
    pub fn new(max_elements: usize, m: usize, ef_construction: usize, ef_search: usize) -> Self {
        let dim = 128;
        let max_layer = 16;
        let hnsw = Hnsw::<f32, DistCosine>::new(
            m,
            max_elements,
            max_layer,
            ef_construction,
            DistCosine::default(),
        );
        Self {
            max_elements,
            m,
            ef_construction,
            ef_search,
            dim,
            hnsw,
            labels: Vec::new(),
            label_to_id: HashMap::new(),
        }
    }

    pub fn insert(&mut self, id: String, embedding: [f32; 128]) -> Result<(), String> {
        if self.labels.len() >= self.max_elements {
            return Err("HNSW index is at capacity".to_string());
        }

        if self.label_to_id.contains_key(&id) {
            return Err("Identity already exists".to_string());
        }

        let idx = self.labels.len();
        self.labels.push(id.clone());
        self.label_to_id.insert(id, idx);

        self.hnsw.insert((embedding.as_slice(), idx));
        Ok(())
    }

    pub fn search(&self, query: &[f32; 128], k: usize) -> Vec<(String, f32)> {
        if self.labels.is_empty() {
            return vec![];
        }

        let neighbors: Vec<Neighbour> = self.hnsw.search(query.as_slice(), k, self.ef_search);
        neighbors
            .into_iter()
            .filter_map(|neighbor| {
                let label = self.labels.get(neighbor.d_id)?.clone();
                let similarity = (1.0 - neighbor.distance).clamp(0.0, 1.0);
                Some((label, similarity))
            })
            .collect()
    }

    pub fn len(&self) -> usize {
        self.labels.len()
    }
}
