from flask import Flask, request, jsonify
from typing import List, Dict, Any, Optional
from pathlib import Path
import time
import json
import logging
from dataclasses import dataclass
import os

from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredMarkdownLoader,
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_ollama import ChatOllama
from langchain_core.callbacks import BaseCallbackHandler
from langchain.schema import Document
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@dataclass
class AppConfig:
    """Application configuration"""

    PERSIST_DIR: str = os.getenv("PERSIST_DIR", "vectorstore")
    EMBEDDINGS_MODEL: str = os.getenv(
        "EMBEDDINGS_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
    )
    LLM_MODEL: str = os.getenv("LLM_MODEL", "llama3.2-vision")
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "1000"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "200"))
    TEMPERATURE: float = float(os.getenv("TEMPERATURE", "0.7"))
    TOP_K_RESULTS: int = int(os.getenv("TOP_K_RESULTS", "3"))


class StreamHandler(BaseCallbackHandler):
    """Handles streaming of LLM tokens"""

    def __init__(self):
        self.tokens = []

    def on_llm_new_token(self, token: str, **kwargs) -> None:
        """Stream tokens as server-sent events"""
        response = {"type": "token", "content": token, "timestamp": time.time()}
        print(json.dumps(response), flush=True)


class DocumentLoader:
    """Handles document loading and splitting"""

    SUPPORTED_EXTENSIONS = {
        ".pdf": PyPDFLoader,
        ".txt": TextLoader,
        ".doc": Docx2txtLoader,
        ".docx": Docx2txtLoader,
        ".md": UnstructuredMarkdownLoader,
    }

    @staticmethod
    def load_and_split(
        file_path: str, chunk_size: int, chunk_overlap: int
    ) -> List[Document]:
        """Load and split a document into chunks"""
        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        loader_class = DocumentLoader.SUPPORTED_EXTENSIONS.get(file_path.suffix.lower())
        if not loader_class:
            raise ValueError(f"Unsupported file type: {file_path.suffix}")

        try:
            loader = loader_class(str(file_path))
            documents = loader.load()

            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size, chunk_overlap=chunk_overlap, length_function=len
            )

            return text_splitter.split_documents(documents)
        except Exception as e:
            logger.error(f"Error loading document {file_path}: {str(e)}")
            raise


class RAGEngine:
    """Main RAG engine handling document processing and querying"""

    def __init__(self, config: AppConfig):
        self.config = config
        self.vector_store: Optional[FAISS] = None
        self.qa_chain: Optional[RetrievalQA] = None
        self.setup_components()

    def setup_components(self):
        """Initialize LangChain components"""
        try:
            # Initialize embeddings
            self.embeddings = HuggingFaceEmbeddings(
                model_name=self.config.EMBEDDINGS_MODEL
            )

            # Initialize vector store
            persist_path = Path(self.config.PERSIST_DIR)
            if persist_path.exists():
                try:
                    self.vector_store = FAISS.load_local(
                        self.config.PERSIST_DIR,
                        self.embeddings,
                        allow_dangerous_deserialization=True,
                    )
                except Exception as e:
                    logger.warning(f"Failed to load existing vector store: {e}")
                    self.vector_store = FAISS.from_texts(
                        [""], embedding=self.embeddings
                    )
            else:
                persist_path.mkdir(parents=True, exist_ok=True)
                self.vector_store = FAISS.from_texts([""], embedding=self.embeddings)

            # Initialize LLM
            self.llm = ChatOllama(
                model=self.config.LLM_MODEL,
                callbacks=[StreamHandler()],
                temperature=self.config.TEMPERATURE,
            )

            # Setup QA chain with improved prompt
            prompt_template = """Use the following pieces of context to answer the question at the end. 
            If you don't know the answer, just say that you don't know, don't try to make up an answer.
            Always provide reasoning for your answer based on the context provided.
            If the question is not related to the context, politely indicate this.
            
            Context:
            {context}
            
            Question: {question}
            Thoughtful Answer:"""

            self.qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=self.vector_store.as_retriever(
                    search_kwargs={"k": self.config.TOP_K_RESULTS}
                ),
                chain_type_kwargs={
                    "prompt": PromptTemplate(
                        template=prompt_template,
                        input_variables=["context", "question"],
                    )
                },
                return_source_documents=True,
            )

        except Exception as e:
            logger.error(f"Failed to initialize RAG engine: {e}")
            raise

    def load_document(self, file_path: str) -> Dict[str, Any]:
        """Load and index a document"""
        try:
            splits = DocumentLoader.load_and_split(
                file_path,
                self.config.CHUNK_SIZE,
                self.config.CHUNK_OVERLAP
            )

            self.vector_store.add_documents(splits)
            self.vector_store.save_local(self.config.PERSIST_DIR)

            return {
                "status": "success",
                "type": "document_loaded",
                "num_chunks": len(splits),
                "file_path": file_path,
            }
        except Exception as e:
            logger.error(f"Error loading document: {e}")
            return {"status": "error", "message": str(e)}


    def query(self, question: str) -> Dict[str, Any]:
        """Process a query against the loaded documents"""
        try:
            if not self.qa_chain:
                raise ValueError("QA chain not initialized")

            result = self.qa_chain.invoke({"query": question})
            
            sources = [
                {
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "relevance_score": getattr(doc, 'relevance_score', None)
                }
                for doc in result.get("source_documents", [])
            ]

            return {
                "status": "success",
                "type": "final_answer",
                "answer": result["result"],
                "sources": sources
            }

        except Exception as e:
            logger.error(f"Error processing query: {e}")
            return {
                "status": "error",
                "message": str(e)
            }

# Flask application setup
app = Flask(__name__)
config = AppConfig()
engine: Optional[RAGEngine] = None


@app.before_request
def initialize_engine():
    global engine
    engine = RAGEngine(config)


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": time.time()}), 200


@app.route("/load_document", methods=["POST"])
def load_document():
    """Endpoint to load and index a document"""
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.json
    file_path = data.get("file_path")

    if not file_path:
        return jsonify({"error": "file_path is required"}), 400

    response = engine.load_document(file_path)
    return jsonify(response), 200 if response["status"] == "success" else 400


@app.route("/query", methods=["POST"])
def handle_query():
    """Endpoint to process queries"""
    if not request.is_json:
        return jsonify({"error": "Content-Type must be application/json"}), 400

    data = request.json
    question = data.get("question")

    if not question:
        return jsonify({"error": "question is required"}), 400

    response = engine.query(question)
    return jsonify(response), 200 if response["status"] == "success" else 400


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
