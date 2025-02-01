// types.ts
export interface QueryRequest {
  type: "load_document" | "query";
  filePath?: string;
  question?: string;
}

export interface DocumentResponse {
  type: "document_loaded";
  numChunks: number;
  filePath: string;
}

export interface QueryResponse {
  type: "final_answer";
  answer: string;
  sources: SourceDocument[];
}

export interface ErrorResponse {
  type: "error";
  error: string;
  timestamp: number;
}

export interface TokenResponse {
  type: "token";
  content: string;
  timestamp: number;
}

export interface SourceDocument {
  content: string;
  metadata: Record<string, any>;
}

export type Response =
  | DocumentResponse
  | QueryResponse
  | ErrorResponse
  | TokenResponse;

//
import {
  ChatOllama,
  OllamaEmbeddings,
  PDFLoader,
  TextLoader,
  DocxLoader,
  MarkdownTextSplitter,
  RecursiveCharacterTextSplitter,
  Chroma,
  Document,
  BaseCallbackHandler,
  PromptTemplate,
  RunnableSequence,
  StringOutputParser,
} from "@langchain/core";
import { ChainValues } from "@langchain/core/utils/types";
import path from "path";
import fs from "fs";

class StreamHandler extends BaseCallbackHandler {
  constructor() {
    super();
  }

  handleLLMNewToken(token: string): void {
    const response: Response = {
      type: "token",
      content: token,
      timestamp: Date.now(),
    };
    console.log(JSON.stringify(response));
  }
}

export class RAGEngine {
  private vectorStore: Chroma;
  private embeddings: OllamaEmbeddings;
  private llm: ChatOllama;
  private isRunning: boolean = true;
  private qaChain: RunnableSequence;

  constructor(private persistDir: string = "db") {
    this.setupComponents();
  }

  private async setupComponents(): Promise<void> {
    try {
      // Initialize embeddings
      this.embeddings = new OllamaEmbeddings({
        model: "mistral",
        baseUrl: "http://localhost:11434",
      });

      // Initialize vector store
      this.vectorStore = await Chroma.fromExisting(this.embeddings, {
        collectionName: "docs",
        url: this.persistDir,
      });

      // Initialize Ollama model
      this.llm = new ChatOllama({
        model: "mistral",
        baseUrl: "http://localhost:11434",
        callbacks: [new StreamHandler()],
        temperature: 0.7,
      });

      // Setup QA chain
      const prompt = PromptTemplate.fromTemplate(`
                Use the following pieces of context to answer the question at the end.
                If you don't know the answer, just say that you don't know, don't try to make up an answer.
                
                Context: {context}
                
                Question: {question}
                Helpful Answer:`);

      this.qaChain = RunnableSequence.from([
        {
          context: (input: ChainValues) =>
            this.vectorStore.asRetriever().getRelevantDocuments(input.question),
          question: (input: ChainValues) => input.question,
        },
        prompt,
        this.llm,
        new StringOutputParser(),
      ]);
    } catch (error) {
      this.sendError(`Failed to initialize components: ${error.message}`);
      throw error;
    }
  }

  private async loadDocument(filePath: string): Promise<Document[]> {
    try {
      // Select loader based on file extension
      const ext = path.extname(filePath).toLowerCase();
      let loader;

      switch (ext) {
        case ".pdf":
          loader = new PDFLoader(filePath);
          break;
        case ".txt":
          loader = new TextLoader(filePath);
          break;
        case ".docx":
          loader = new DocxLoader(filePath);
          break;
        case ".md": {
          const text = fs.readFileSync(filePath, "utf-8");
          const splitter = new MarkdownTextSplitter();
          return await splitter.createDocuments([text]);
        }
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }

      // Load document
      const documents = await loader.load();

      // Split text
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splits = await textSplitter.splitDocuments(documents);

      // Add to vector store
      await this.vectorStore.addDocuments(splits);
      await this.vectorStore.persist();

      return splits;
    } catch (error) {
      this.sendError(`Failed to load document: ${error.message}`);
      return [];
    }
  }

  private async processQuery(query: QueryRequest): Promise<void> {
    try {
      if (query.type === "load_document" && query.filePath) {
        const splits = await this.loadDocument(query.filePath);
        const response: Response = {
          type: "document_loaded",
          numChunks: splits.length,
          filePath: query.filePath,
        };
        this.sendResponse(response);
      } else if (query.type === "query" && query.question) {
        const result = await this.qaChain.invoke({
          question: query.question,
        });

        // Get source documents
        const docs = await this.vectorStore.similaritySearch(query.question, 3);
        const sources: SourceDocument[] = docs.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        }));

        const response: Response = {
          type: "final_answer",
          answer: result,
          sources,
        };
        this.sendResponse(response);
      }
    } catch (error) {
      this.sendError(`Error processing query: ${error.message}`);
    }
  }

  private sendResponse(response: Response): void {
    try {
      console.log(JSON.stringify(response));
    } catch (error) {
      this.sendError(`Failed to send response: ${error.message}`);
    }
  }

  private sendError(message: string): void {
    const errorResponse: ErrorResponse = {
      type: "error",
      error: message,
      timestamp: Date.now(),
    };
    console.log(JSON.stringify(errorResponse));
  }

  public async run(): Promise<void> {
    process.stdin.setEncoding("utf-8");

    process.stdin.on("data", async (data: string) => {
      if (!this.isRunning) return;

      try {
        const lines = data.trim().split("\n");
        for (const line of lines) {
          if (!line) continue;
          const query: QueryRequest = JSON.parse(line);
          await this.processQuery(query);
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          this.sendError(`Invalid JSON: ${error.message}`);
        } else {
          this.sendError(`Processing error: ${error.message}`);
        }
      }
    });

    process.stdin.on("end", () => {
      this.isRunning = false;
    });
  }
}

// index.ts
async function main() {
  const engine = new RAGEngine();
  await engine.run();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
