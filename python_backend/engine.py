# rag_engine.py
import sys
import json
import time
from typing import Dict, Any, List, Optional
from pathlib import Path

from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredMarkdownLoader,
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_ollama import ChatOllama
from langchain_core.callbacks import BaseCallbackHandler
from langchain.schema import Document
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate


class StreamHandler(BaseCallbackHandler):
    def __init__(self):
        self.tokens = []

    def on_llm_new_token(self, token: str, **kwargs) -> None:
        """Stream tokens back to Electron"""
        response = {"type": "token", "content": token, "timestamp": time.time()}
        print(json.dumps(response), flush=True)


class RAGEngine:
    def __init__(self, persist_dir: str = "db"):
        self.persist_dir = persist_dir
        self.is_running = True
        self.setup_components()
        print()
        print()
        print("HELLO THERE")
        print()
        print()
        print()

    def setup_components(self):
        """Initialize LangChain components"""
        try:
            # Initialize embeddings
            self.embeddings = HuggingFaceEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )

            # Initialize vector store
            if Path(self.persist_dir).exists():
                self.vector_store = Chroma(
                    persist_directory=self.persist_dir,
                    embedding_function=self.embeddings,
                )
            else:
                self.vector_store = Chroma(
                    persist_directory=self.persist_dir,
                    embedding_function=self.embeddings,
                )

            # Initialize Ollama model
            self.llm = ChatOllama(
                model="llama3.2-vision",  # or any other model you've pulled in Ollama
                callbacks=[StreamHandler()],
                temperature=0.7,
            )

            # Setup QA chain
            custom_template = """Use the following pieces of context to answer the question at the end. 
            If you don't know the answer, just say that you don't know, don't try to make up an answer.
            
            {context}
            
            Question: {question}
            Helpful Answer:"""

            QA_CHAIN_PROMPT = PromptTemplate(
                input_variables=["context", "question"],
                template=custom_template,
            )

            self.qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=self.vector_store.as_retriever(search_kwargs={"k": 3}),
                chain_type_kwargs={"prompt": QA_CHAIN_PROMPT},
                return_source_documents=True,
            )

        except Exception as e:
            self.send_error(f"Failed to initialize components: {str(e)}")
            raise

    def load_document(self, file_path: str) -> List[Document]:
        """Load and split document"""
        try:
            # Select loader based on file extension
            file_path = Path(file_path)
            if file_path.suffix == ".pdf":
                loader = PyPDFLoader(str(file_path))
            elif file_path.suffix == ".txt":
                loader = TextLoader(str(file_path))
            elif file_path.suffix in [".doc", ".docx"]:
                loader = Docx2txtLoader(str(file_path))
            elif file_path.suffix == ".md":
                loader = UnstructuredMarkdownLoader(str(file_path))
            else:
                raise ValueError(f"Unsupported file type: {file_path.suffix}")

            # Load document
            documents = loader.load()

            # Split text
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=1000, chunk_overlap=200, length_function=len
            )

            splits = text_splitter.split_documents(documents)

            # Add to vector store
            self.vector_store.add_documents(splits)
            self.vector_store.persist()

            return splits

        except Exception as e:
            self.send_error(f"Failed to load document: {str(e)}")
            return []

    def process_query(self, query: Dict[Any, Any]):
        """Process incoming query"""
        try:
            query_type = query.get("type", "")

            if query_type == "load_document":
                file_path = query.get("file_path", "")
                splits = self.load_document(file_path)
                self.send_response(
                    {
                        "type": "document_loaded",
                        "num_chunks": len(splits),
                        "file_path": file_path,
                    }
                )

            elif query_type == "query":
                question = query.get("question", "")
                result = self.qa_chain({"query": question})

                # Send final response with sources
                sources = [
                    {"content": doc.page_content, "metadata": doc.metadata}
                    for doc in result.get("source_documents", [])
                ]

                self.send_response(
                    {
                        "type": "final_answer",
                        "answer": result["result"],
                        "sources": sources,
                    }
                )

        except Exception as e:
            self.send_error(f"Error processing query: {str(e)}")

    def send_response(self, response: Dict[Any, Any]):
        """Send response back to Electron"""
        try:
            print(json.dumps(response), flush=True)
        except Exception as e:
            self.send_error(f"Failed to send response: {str(e)}")

    def send_error(self, error_message: str):
        """Send error message back to Electron"""
        error_response = {
            "type": "error",
            "error": error_message,
            "timestamp": time.time(),
        }
        print(json.dumps(error_response), flush=True)

    def run(self):
        """Main loop to process incoming messages"""
        while self.is_running:
            try:
                # Read line from stdin
                line = sys.stdin.readline()

                # Check if input stream is closed
                if not line:
                    self.is_running = False
                    break

                # Parse the query
                query = json.loads(line)

                # Process the query
                self.process_query(query)

            except json.JSONDecodeError as e:
                self.send_error(f"Invalid JSON: {str(e)}")
            except Exception as e:
                self.send_error(f"Processing error: {str(e)}")


if __name__ == "__main__":
    engine = RAGEngine()
    engine.run()
